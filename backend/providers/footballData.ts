import { TtlCache } from '../cache';
import { fetchJson } from '../http';
import type { FootballDataMatch } from '../raw';

const BASE = 'https://api.football-data.org/v4';

export class FootballDataProvider {
  // Free tier allows 10 requests/minute; the short cache absorbs manual refresh spam.
  private cache = new TtlCache<unknown>(10_000);

  constructor(private apiKey: string, private matchId = '') {}

  private get<T>(path: string) {
    return this.cache.wrap(path, () => fetchJson<T>(`${BASE}${path}`, { headers: { 'X-Auth-Token': this.apiKey } })) as Promise<T>;
  }

  /** The pinned match, else the first in-play one. Resolves null when nothing is live. */
  async fetchCurrent(): Promise<FootballDataMatch | null> {
    let match: FootballDataMatch | undefined;
    if (this.matchId) {
      match = await this.get<FootballDataMatch>(`/matches/${encodeURIComponent(this.matchId)}`);
    } else {
      const list = await this.get<{ matches: FootballDataMatch[] }>('/matches?status=IN_PLAY,PAUSED');
      match = list.matches[0];
    }
    if (!match) return null;
    try {
      // The list endpoint omits goals/bookings; the detail endpoint has them when the plan allows.
      const detail = await this.get<FootballDataMatch>(`/matches/${match.id}`);
      return { ...match, ...detail };
    } catch {
      return match;
    }
  }
}
