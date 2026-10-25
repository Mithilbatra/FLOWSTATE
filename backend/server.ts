import express from 'express';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config';
import { BusyError, Hub } from './hub';
import { VisionUnavailableError } from './vision';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional
}

const cfg = loadConfig();
const hub = new Hub(cfg);
const app = express();

// Only answer requests addressed to this machine by name. A web page using DNS rebinding arrives with its own
// host name, and must not be able to drive the API (screen frames spend your vision-model quota).
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use((req, res, next) => (LOCAL_HOST.test(req.headers.host ?? '') ? next() : res.status(403).end()));

// Screen frames are ~200 KB JPEGs, so this route gets its own body limit (registered before the 4 KB default).
app.post('/api/screen/frame', express.json({ limit: '4mb' }), async (req, res) => {
  const image = req.body?.image;
  if (typeof image !== 'string' || image.length > 4_000_000 || !/^[A-Za-z0-9+/]+=*$/.test(image)) {
    return res.status(400).json({ error: 'image must be a base64 JPEG' });
  }
  try {
    res.json({ read: await hub.ingestFrame(image) });
  } catch (err) {
    if (err instanceof BusyError) return res.status(429).json({ error: err.message });
    if (err instanceof VisionUnavailableError) return res.status(503).json({ error: err.message });
    const message = (err as Error).message;
    console.warn('[screen] frame failed:', message);
    // Show the provider's own reason (e.g. "credit balance is too low", "quota exceeded"), not a generic line.
    const reason = message.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? message;
    res.status(502).json({ error: `Frame not analysed: ${reason.slice(0, 200)}` });
  }
});

app.use(express.json({ limit: '4kb' }));

app.post('/api/screen/stop', async (_req, res) => {
  await hub.stopScreen();
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ...hub.info() }));

app.get('/api/match', (_req, res) => {
  const match = hub.current();
  if (match) res.json(match);
  else res.status(503).json({ error: 'Match feed is starting' });
});

app.post('/api/refresh', async (_req, res) => {
  await hub.refresh();
  res.json(hub.current());
});

// Runtime config from the onboarding screen. The key lives in memory only and is never echoed back.
app.post('/api/config', async (req, res) => {
  const { mode, apiKey } = req.body ?? {};
  if (mode !== 'demo' && mode !== 'live') return res.status(400).json({ error: 'mode must be "demo" or "live"' });
  if (apiKey !== undefined && (typeof apiKey !== 'string' || !/^[\w-]{0,128}$/.test(apiKey))) {
    return res.status(400).json({ error: 'apiKey looks invalid' });
  }
  await hub.setConfig({ mode, ...(apiKey !== undefined && { apiKey }) });
  res.json(hub.info());
});

// Serve the built frontend when present (npm run build && npm start).
const dist = path.resolve(import.meta.dirname, '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/stream') && LOCAL_HOST.test(req.headers.host ?? '')) wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  else socket.destroy();
});
wss.on('connection', (ws) => {
  const match = hub.current();
  if (match) ws.send(JSON.stringify(match));
});
hub.subscribe((match) => {
  const payload = JSON.stringify(match);
  wss.clients.forEach((c) => c.readyState === c.OPEN && c.send(payload));
});

hub.start();
server.listen(cfg.port, '127.0.0.1', () => {
  console.log(`[server] http://127.0.0.1:${cfg.port}  mode=${cfg.mode}${cfg.mode === 'live' && !cfg.apiKey ? ' (no API key, will fall back to demo)' : ''}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    hub.stop();
    server.close();
    process.exit(0);
  });
}
