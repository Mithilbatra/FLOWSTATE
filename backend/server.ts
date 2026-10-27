import path from 'node:path';
import { createServer } from './app';
import { loadConfig } from './config';
import { Hub } from './hub';

try {
  process.loadEnvFile('.env');
} catch (err) {
  // A missing .env is fine. Anything else (bad syntax, or a Node too old to have loadEnvFile) must not silently drop your keys.
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const cfg = loadConfig();
const hub = new Hub(cfg);
const server = createServer(hub, path.resolve(import.meta.dirname, '../dist'));

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
