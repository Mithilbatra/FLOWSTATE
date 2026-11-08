// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FootballDataProvider } from '../backend/providers/footballData';

const fixture = JSON.parse(readFileSync('data/fixtures/football-data-sample.json', 'utf8'));
// The list endpoint leaves out goals, bookings and substitutions; the detail endpoint has them.
const { goals, bookings, substitutions, ...listed } = fixture;
const LIST = '/matches?status=IN_PLAY,PAUSED';
const DETAIL = `/matches/${fixture.id}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake football-data.org that answers by path (404 for anything else) and records every request. */
function serve(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => routes[url.replace('https://api.football-data.org/v4', '')]?.() ?? json({}, 404));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('FootballDataProvider (audit #4)', () => {
  it('reads the first match in play, with goals and bookings from its detail page', async () => {
    const fetchMock = serve({ [LIST]: () => json({ matches: [listed] }), [DETAIL]: () => json(fixture) });
    await expect(new FootballDataProvider('key').fetchCurrent()).resolves.toEqual(fixture);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'X-Auth-Token': 'key' }); // the key goes in a header, never the URL
  });

  it('falls back to the list entry when the plan does not allow the detail page', async () => {
    serve({ [LIST]: () => json({ matches: [listed] }), [DETAIL]: () => json({ message: 'restricted' }, 403) });
    await expect(new FootballDataProvider('key').fetchCurrent()).resolves.toEqual(listed);
  });

  it('resolves null when no match is being played', async () => {
    const fetchMock = serve({ [LIST]: () => json({ matches: [] }) });
    await expect(new FootballDataProvider('key').fetchCurrent()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads only the pinned match when MATCH_ID is set', async () => {
    const fetchMock = serve({ [DETAIL]: () => json(fixture) });
    await expect(new FootballDataProvider('key', String(fixture.id)).fetchCurrent()).resolves.toEqual(fixture);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`https://api.football-data.org/v4${DETAIL}`]);
  });

  it('asks the API at most once per 10 s, however often it is called (free tier: 10 requests a minute)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetchMock = serve({ [LIST]: () => json({ matches: [listed] }), [DETAIL]: () => json(fixture) });
    const provider = new FootballDataProvider('key');
    for (let i = 0; i < 5; i++) await provider.fetchCurrent();
    expect(fetchMock).toHaveBeenCalledTimes(2); // one list and one detail request
    vi.setSystemTime(Date.now() + 11_000);
    await provider.fetchCurrent();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
