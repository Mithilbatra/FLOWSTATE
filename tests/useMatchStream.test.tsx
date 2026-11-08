import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMatch } from './helpers';

// Keep the rest of the API module; replace the two network calls the hook makes.
const api = vi.hoisted(() => ({ getMatch: vi.fn(), refreshMatch: vi.fn() }));
vi.mock('../src/services/api', async (original) => ({ ...(await original<object>()), ...api }));

const { useMatchStream } = await import('../src/hooks/useMatchStream');

/** The parts of a browser WebSocket the hook uses. Tests open it and close it by hand. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  push(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  // A real socket fires onclose for a dropped connection, a failed attempt, and its own close() alike.
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const latest = () => FakeSocket.all[FakeSocket.all.length - 1];
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/** The server goes away (or a reconnect attempt fails): the current socket closes. */
const serverDrops = async () => {
  act(() => latest().close());
  await advance(0); // let the poll it starts finish
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  FakeSocket.all = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  api.getMatch.mockReset();
});

describe('useMatchStream (audit #4)', () => {
  it('goes live when the socket opens and shows each match the server pushes', async () => {
    const { result } = renderHook(() => useMatchStream());
    expect(result.current.link).toBe('connecting');
    expect(latest().url).toMatch(/^ws:\/\/[^/]+\/stream$/);
    act(() => latest().open());
    expect(result.current.link).toBe('live');
    const m = makeMatch(5);
    act(() => latest().push(m));
    expect(result.current.match).toEqual(m);
    expect(api.getMatch).not.toHaveBeenCalled();
  });

  it('polls at once and then every 5 s while the socket is down, and stops polling when it is back', async () => {
    const m = makeMatch(5);
    api.getMatch.mockResolvedValue(m);
    const { result } = renderHook(() => useMatchStream());
    act(() => latest().open());
    await serverDrops();
    expect(api.getMatch).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ link: 'polling', match: m });
    await advance(5000);
    expect(api.getMatch).toHaveBeenCalledTimes(2);
    act(() => latest().open()); // the reconnect attempt made 1 s after the drop gets through
    expect(FakeSocket.all).toHaveLength(2);
    expect(result.current.link).toBe('live');
    await advance(20_000);
    expect(api.getMatch).toHaveBeenCalledTimes(2);
  });

  it('retries after 1, 2, 4 and 8 s, then every 10 s, and starts over after a good connection', async () => {
    api.getMatch.mockResolvedValue(makeMatch(5));
    renderHook(() => useMatchStream());
    const expectRetryAfter = async (ms: number) => {
      const sockets = FakeSocket.all.length;
      await serverDrops();
      await advance(ms - 1);
      expect(FakeSocket.all).toHaveLength(sockets);
      await advance(1);
      expect(FakeSocket.all).toHaveLength(sockets + 1);
    };
    for (const ms of [1000, 2000, 4000, 8000, 10_000, 10_000]) await expectRetryAfter(ms);
    act(() => latest().open());
    await expectRetryAfter(1000);
  });

  it('shows offline when polling fails too, and recovers on the next good poll', async () => {
    api.getMatch.mockRejectedValue(new Error('server down'));
    const { result } = renderHook(() => useMatchStream());
    await serverDrops();
    expect(result.current.link).toBe('offline');
    const m = makeMatch(5);
    api.getMatch.mockResolvedValue(m);
    await advance(5000);
    expect(result.current).toMatchObject({ link: 'polling', match: m });
  });

  it('keeps the link live when a poll started before the reconnect finishes after it', async () => {
    let finish!: (m: unknown) => void;
    api.getMatch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useMatchStream());
    await serverDrops(); // this poll stays in flight
    await advance(1000);
    act(() => latest().open());
    const m = makeMatch(5);
    finish(m);
    await advance(0);
    expect(result.current).toMatchObject({ link: 'live', match: m });
  });

  it('does not start polling when the page closes a live socket', async () => {
    const { unmount } = renderHook(() => useMatchStream());
    act(() => latest().open());
    unmount();
    await advance(30_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(api.getMatch).not.toHaveBeenCalled();
  });

  it('stops reconnecting and polling once the page is gone', async () => {
    api.getMatch.mockResolvedValue(makeMatch(5));
    const { unmount } = renderHook(() => useMatchStream());
    await serverDrops();
    unmount();
    await advance(30_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(api.getMatch).toHaveBeenCalledTimes(1); // only the poll made at the drop
  });
});
