import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../backend/config';
import { BusyError, Hub } from '../backend/hub';
import type { ScreenRead } from '../backend/vision';

const fixture = JSON.parse(readFileSync('data/fixtures/football-data-sample.json', 'utf8'));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
// tick() is private; the tests drive one update at a time instead of the timer loop.
const tick = (hub: Hub, advance = true) => (hub as unknown as { tick(a: boolean): Promise<void> }).tick(advance);

afterEach(() => vi.unstubAllGlobals());

describe('Hub live mode', () => {
  it('keeps showing the live match between polls instead of flipping to demo data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('status=') ? json({ matches: [fixture] }) : json(fixture))));
    const hub = new Hub({ ...loadConfig({}), mode: 'live', apiKey: 'k' });
    await hub.refresh();
    expect(hub.current()?.mode).toBe('live');
    await tick(hub);
    await hub.refresh();
    expect(hub.current()?.mode).toBe('live');
  });

  it('keeps the demo fallback moving while the API is down, without re-polling every update', async () => {
    const fetchMock = vi.fn(async () => json({ message: 'bad token' }, 403));
    vi.stubGlobal('fetch', fetchMock);
    const hub = new Hub({ ...loadConfig({}), mode: 'live', apiKey: 'bad' });
    await hub.refresh();
    const calls = fetchMock.mock.calls.length;
    const first = hub.current()!;
    expect(first.mode).toBe('demo');
    expect(first.notice).toMatch(/Live API unavailable/);
    await tick(hub);
    await tick(hub);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(hub.current()!.minute).toBe(first.minute + 2);
  });
});

describe('Hub screen mode', () => {
  const read = (over: Partial<ScreenRead> = {}): ScreenRead => ({
    football_visible: true, is_replay: false, competition: null, home_team: 'BAR', away_team: 'RMA',
    home_score: 1, away_score: 0, clock: '55:10', period: 'second_half', home_color: null, away_color: null,
    possession: 'away', attacking_team: 'away', danger: 'final_third', event: 'none', event_team: 'unknown',
    event_player: null, caption: 'Madrid probing down the right.',
    stats: { possession_home: null, possession_away: null, shots_home: null, shots_away: null, shots_on_target_home: null, shots_on_target_away: null, corners_home: null, corners_away: null, fouls_home: null, fouls_away: null, xg_home: null, xg_away: null },
    ...over,
  });

  it('publishes what was read from the screen, then returns to demo when stopped', async () => {
    const hub = new Hub(loadConfig({}), async () => read());
    await expect(hub.ingestFrame('AAAA')).resolves.toBe('BAR 1–0 RMA · 55:10 · RMA attacking');
    const m = hub.current()!;
    expect(m.mode).toBe('screen');
    expect(m.score).toEqual({ home: 1, away: 0 });
    expect(m.minute).toBe(56);
    expect(m.insights[0]).toMatchObject({ id: 'live-read', text: 'Madrid probing down the right.' });
    await hub.stopScreen();
    expect(hub.current()!.mode).toBe('demo');
  });

  it('shows a notice until a match is recognised', async () => {
    const hub = new Hub(loadConfig({}), async () => read({ football_visible: false }));
    await hub.ingestFrame('AAAA');
    expect(hub.current()!.mode).toBe('demo');
    expect(hub.current()!.notice).toMatch(/Scanning your screen/);
  });

  it('reads one frame at a time', async () => {
    let release!: () => void;
    const hub = new Hub(loadConfig({}), () => new Promise((resolve) => (release = () => resolve(read()))));
    const first = hub.ingestFrame('AAAA');
    await expect(hub.ingestFrame('AAAA')).rejects.toBeInstanceOf(BusyError);
    release();
    await first;
  });
});
