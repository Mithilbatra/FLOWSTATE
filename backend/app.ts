import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { BusyError, type Hub } from './hub';
import { VisionUnavailableError } from './vision';

// Only answer requests addressed to this machine by name, from pages this machine served. DNS rebinding arrives
// with a foreign Host; a cross-site form or fetch arrives with a foreign Origin. Either could spend your
// vision-model quota or stop a scan.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const isLocal = (req: IncomingMessage) =>
  LOCAL_HOST.test(req.headers.host ?? '') && (!req.headers.origin || LOCAL_ORIGIN.test(req.headers.origin));

/** HTTP + WebSocket server around the hub. Serves the built frontend from `dist` when it exists. */
/** Scan ids come from crypto.randomUUID() in the overlay. */
const SCAN_ID = /^[\w-]{1,64}$/;

export function createServer(hub: Hub, dist?: string) {
  const app = express();
  app.use((req, res, next) => (isLocal(req) ? next() : res.status(403).end()));

  // Screen frames are ~200 KB JPEGs, so this route gets its own body limit (registered before the 4 KB default).
  app.post('/api/screen/frame', express.json({ limit: '4mb' }), async (req, res) => {
    const { image, scanId } = req.body ?? {};
    if (typeof image !== 'string' || image.length > 4_000_000 || !/^[A-Za-z0-9+/]+=*$/.test(image)) {
      return res.status(400).json({ error: 'image must be a base64 JPEG' });
    }
    if (scanId !== undefined && (typeof scanId !== 'string' || !SCAN_ID.test(scanId))) {
      return res.status(400).json({ error: 'scanId looks invalid' });
    }
    try {
      res.json(await hub.ingestFrame(image, scanId));
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

  app.post('/api/screen/stop', async (req, res) => {
    // ?scan=<id>: only the window running the scan may stop it (also sent as a beacon when its window closes).
    await hub.stopScreen(typeof req.query.scan === 'string' ? req.query.scan : undefined);
    res.json({ ok: true });
  });

  app.post('/api/screen/alive', (req, res) => {
    // ?scan=<id>: the scanning window is still open, but its picture has not changed (a paused video), so it sends no frames.
    const scan = req.query.scan;
    if (typeof scan !== 'string' || !SCAN_ID.test(scan)) return res.status(400).json({ error: 'scan looks invalid' });
    hub.keepAlive(scan);
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
  if (dist && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
  }

  // JSON errors instead of Express's HTML page, which shows a stack trace with file paths (bad JSON, huge body, crashes).
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = Number(err?.status ?? err?.statusCode) || 500;
    if (status >= 500) console.error('[server]', err);
    res.status(status).json({ error: status < 500 ? String(err.message) : 'Server error' });
  };
  app.use(onError);

  const server = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/stream') && isLocal(req)) wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
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
  return server;
}
