import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../backend/cache';
import { fetchJson } from '../backend/http';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fast = { baseDelayMs: 1 };

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson', () => {
  it('retries server errors and then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ok({ a: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.com/x', {}, fast)).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.com/x', {}, fast)).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 429 rate limit (audit #17)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.com/x', {}, fast)).rejects.toThrow('HTTP 429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry client errors such as a bad API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.com/x', {}, fast)).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('TtlCache', () => {
  it('serves cached values until they expire', async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    const load = vi.fn().mockResolvedValue(1);
    await cache.wrap('k', load);
    await cache.wrap('k', load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1500);
    await cache.wrap('k', load);
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
