// @vitest-environment node
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createServer } from '../backend/app';
import { loadConfig } from '../backend/config';
import { Hub } from '../backend/hub';
import { VisionUnavailableError, type ScreenRead } from '../backend/vision';
import { screenRead } from './helpers';

// Each test sets how the next frame read behaves.
let reader: () => Promise<ScreenRead> = () => Promise.reject(new Error('no reader set'));
const hub = new Hub(loadConfig({}), () => reader());
const server = createServer(hub);
let port = 0;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  await hub.refresh();
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
// Each test is its own scan, as if a new overlay started it.
afterEach(() => hub.stopScreen());

function call(method: string, path: string, opts: { headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `localhost:${port}`, ...opts.headers } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, type: String(res.headers['content-type'] ?? ''), body }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}
const postJson = (path: string, data: unknown) =>
  call('POST', path, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

describe('who may talk to the server (audit #10)', () => {
  it('answers local requests, including ones from the dev page', async () => {
    expect((await call('GET', '/api/health')).status).toBe(200);
    expect((await call('POST', '/api/screen/stop', { headers: { origin: 'http://localhost:5173' } })).status).toBe(200);
  });

  it('refuses a foreign Host (DNS rebinding)', async () => {
    expect((await call('GET', '/api/health', { headers: { host: 'evil.example' } })).status).toBe(403);
  });

  it('refuses a cross-site POST from another website', async () => {
    expect((await call('POST', '/api/screen/stop', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call('POST', '/api/refresh', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
  });

  it('refuses a WebSocket opened by another website, accepts a local one', async () => {
    const open = (origin: string) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`, { origin });
        ws.on('message', () => (ws.close(), resolve('message')));
        ws.on('error', () => resolve('refused'));
      });
    expect(await open('https://evil.example')).toBe('refused');
    expect(await open(`http://localhost:${port}`)).toBe('message');
  });
});

describe('POST /api/screen/frame', () => {
  it('rejects anything that is not base64', async () => {
    expect((await postJson('/api/screen/frame', { image: 'not base64!' })).status).toBe(400);
  });

  it('answers 429 while the previous frame is still being read', async () => {
    let release!: () => void;
    reader = () => new Promise((resolve) => (release = () => resolve(screenRead({ football_visible: false }))));
    const first = postJson('/api/screen/frame', { image: 'AAAA' });
    await new Promise((r) => setTimeout(r, 50));
    expect((await postJson('/api/screen/frame', { image: 'AAAA' })).status).toBe(429);
    release();
    expect((await first).status).toBe(200);
    await hub.stopScreen();
  });

  it('answers 503 with the reason when the key is missing', async () => {
    reader = () => Promise.reject(new VisionUnavailableError('No Gemini key. Set GEMINI_API_KEY in .env and restart the server.'));
    const res = await postJson('/api/screen/frame', { image: 'AAAA' });
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toMatch(/No Gemini key/);
  });

  it("passes on the provider's own reason, not a generic line", async () => {
    reader = () => Promise.reject(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}'));
    const res = await postJson('/api/screen/frame', { image: 'AAAA' });
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body).error).toBe('Frame not analysed: Your credit balance is too low');
  });
});

describe('one scan at a time (audit #9)', () => {
  it('rejects a malformed scan id', async () => {
    expect((await postJson('/api/screen/frame', { image: 'AAAA', scanId: 'not a valid id!' })).status).toBe(400);
  });

  it('lets only the window running the scan stop it', async () => {
    reader = async () => screenRead({ football_visible: false });
    expect((await postJson('/api/screen/frame', { image: 'AAAA', scanId: 'window-a' })).status).toBe(200);
    expect(hub.current()!.notice).toMatch(/Scanning your screen/);
    expect((await call('POST', '/api/screen/stop?scan=window-b')).status).toBe(200);
    expect(hub.current()!.notice).toMatch(/Scanning your screen/); // still scanning
    expect((await call('POST', '/api/screen/stop?scan=window-a')).status).toBe(200);
    expect(hub.current()!.notice ?? '').not.toMatch(/Scanning your screen/);
  });

  it('answers a keep-alive, and rejects a malformed scan id', async () => {
    expect((await call('POST', '/api/screen/alive?scan=not%20valid!')).status).toBe(400);
    expect((await call('POST', '/api/screen/alive')).status).toBe(400);
    expect((await call('POST', '/api/screen/alive?scan=window-a')).status).toBe(200);
  });

  it('tells a second window that another one is scanning', async () => {
    reader = async () => screenRead({ football_visible: false });
    expect((await postJson('/api/screen/frame', { image: 'AAAA', scanId: 'window-a' })).status).toBe(200);
    const res = await postJson('/api/screen/frame', { image: 'AAAA', scanId: 'window-b' });
    expect(res.status).toBe(429);
    expect(JSON.parse(res.body).error).toBe('Another window is already scanning');
  });
});

describe('errors (audit #16)', () => {
  it('answers bad JSON with a JSON error, no stack trace or file paths', async () => {
    const res = await call('POST', '/api/config', { headers: { 'content-type': 'application/json' }, body: '{bad' });
    expect(res.status).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(JSON.parse(res.body).error).toMatch(/JSON/);
    expect(res.body).not.toMatch(/node_modules|\/Users\/|\n\s+at /);
  });
});
