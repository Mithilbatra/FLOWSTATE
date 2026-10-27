import type { EventType, MatchEvent, Side, TeamStats } from '../src/types/match';
import type { BaseMatch } from './normalize';
import type { ScreenRead } from './vision';

/** No recognised frame for this long: the video is probably paused or on an ad break, so say so. */
const STALE_MS = 60_000;
/** Keep the scan (and keep showing it) this long without frames, so a paused video or ad break loses nothing. */
const IDLE_MS = 10 * 60_000;
/** The same card/sub/corner graphic stays on screen across frames; count it once. */
const EVENT_DEDUPE_MS = 90_000;

const EVENT_MAP: Partial<Record<ScreenRead['event'], EventType>> = {
  yellow_card: 'yellow', red_card: 'red', substitution: 'sub', corner: 'corner', offside: 'offside',
};
const EVENT_TEXT: Partial<Record<EventType, string>> = {
  yellow: 'Yellow card', red: 'Red card', sub: 'Substitution', corner: 'Corner', offside: 'Offside',
};
// Stats that a broadcast frame cannot show; the UI renders them as "—".
const MISSING: (keyof TeamStats)[] = ['passAccuracy', 'pressing', 'passingLanes', 'attackZones'];
const XG_PER_CHANCE = 0.12;

// Letters of any script, accents folded ("Atlético" = "Atletico"), so Greek or Cyrillic names don't normalise to "".
const norm = (s: string) => s.normalize('NFD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const isHex = (s: string | null): s is string => !!s && /^#[0-9a-f]{6}$/i.test(s);

/** "MCI", "Man City" and "Manchester City" are one team: same first letter, and the short form's letters appear in order in the long one. */
export function sameTeam(a: string, b: string) {
  const [short, long] = [norm(a), norm(b)].sort((x, y) => x.length - y.length);
  if (!short || short[0] !== long[0]) return false;
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

/** "67:12" -> 68, "45+2" and "45:00 +2" -> 47, "34'" -> 34. Null when unreadable. */
export function parseClock(clock: string | null): number | null {
  if (!clock) return null;
  // The main clock is an mm:ss anywhere ("2H 67:12"), else a bare minute followed by ', + or the end.
  const main = clock.match(/(\d{1,3}):(\d{2})/) ?? clock.match(/(\d{1,3})(?=\s*'?\s*(?:\+|$))/);
  if (!main) return null;
  const inMinute = (min: string, sec?: string) => Number(min) + (sec && Number(sec) > 0 ? 1 : 0);
  // Added time follows the main clock: "45:00 +2", "45:00 +1:23", "90'+3'".
  const added = clock.slice(main.index! + main[0].length).match(/^\s*'?\s*\+\s*(\d{1,2})(?::(\d{2}))?/);
  return added ? Number(main[1]) + inMinute(added[1], added[2]) : Math.max(1, inMinute(main[1], main[2]));
}

type OnScreen = Partial<Record<'possession' | 'shots' | 'shotsOnTarget' | 'corners' | 'fouls' | 'xg', number>>;

/**
 * Accumulates Claude's per-frame reads into a match: the scoreboard gives teams, score and clock;
 * sampled frames estimate possession and pressure; on-screen stat graphics override estimates.
 */
export class ScreenTracker {
  frames = 0;
  caption = '';
  private teams: Record<Side, { name: string; color?: string }> | null = null;
  private competition = '';
  private score = { home: 0, away: 0 };
  private minute = 1;
  private status: BaseMatch['status'] = 'live';
  private possession = { home: 0, away: 0 };
  private danger = { home: 0, away: 0 };
  private chances = { home: 0, away: 0 };
  private onScreen: Record<Side, OnScreen> = { home: {}, away: {} };
  private events: MatchEvent[] = [];
  private lastEventAt = new Map<string, number>();
  private lastSeen = 0;
  private lastFrame = 0;
  private clockSeen = false;
  private pendingMinute: number | null = null;
  private scoreSeen = false;
  private pendingScore: string | null = null;

  /** Teams are known and a match was recognised within the last 10 minutes. */
  detected(now = Date.now()) {
    return this.teams !== null && now - this.lastSeen < IDLE_MS;
  }

  /** Recognised before, but not in the last minute (paused video, ad break, overlay closed). */
  stale(now = Date.now()) {
    return now - this.lastSeen >= STALE_MS;
  }

  /** No frames at all for 10 minutes: the scan was closed without pressing stop. */
  idle(now = Date.now()) {
    return now - this.lastFrame > IDLE_MS;
  }

  apply(r: ScreenRead, now = Date.now()) {
    this.frames++;
    this.lastFrame = now;
    if (!r.football_visible) return;
    if (r.home_team && r.away_team) this.setTeams(r.home_team, r.away_team);
    if (!this.teams) return; // need one scoreboard read before tracking anything
    this.lastSeen = now;
    if (r.caption) this.caption = r.caption;
    if (r.competition) this.competition = r.competition;
    if (isHex(r.home_color)) this.teams.home.color = r.home_color;
    if (isHex(r.away_color)) this.teams.away.color = r.away_color;
    this.readStats(r);
    // Replays, adverts and studio shots repeat old action; don't sample them.
    if (r.is_replay) return;

    this.readClock(r.clock);
    if (r.period === 'half_time') this.status = 'halftime';
    else if (r.period === 'full_time') this.status = 'finished';
    else if (r.period !== 'unknown') this.status = 'live';

    if (r.home_score !== null && r.away_score !== null) this.readScore(r);
    if (r.possession !== 'unclear') this.possession[r.possession]++;
    if (r.attacking_team !== 'none' && (r.danger === 'final_third' || r.danger === 'chance')) this.danger[r.attacking_team]++;
    if (r.attacking_team !== 'none' && r.danger === 'chance') this.chances[r.attacking_team]++;

    const type = EVENT_MAP[r.event];
    if (type && r.event_team !== 'unknown') {
      const key = `${type}-${r.event_team}`;
      if (now - (this.lastEventAt.get(key) ?? -Infinity) > EVENT_DEDUPE_MS) {
        this.lastEventAt.set(key, now);
        this.addEvent(type, r.event_team, r.event_player ?? undefined, `${EVENT_TEXT[type]}${r.event_player ? ` — ${r.event_player}` : ''}`);
      }
    }
  }

  private setTeams(home: string, away: string) {
    const cur = this.teams;
    // Graphics name teams differently (scoreboard "MCI", line-up card "Manchester City"); that is not a new match.
    if (cur && (sameTeam(home, cur.home.name) || sameTeam(away, cur.away.name))) return;
    // Both teams changed: a different match is on screen, start over.
    Object.assign(this, new ScreenTracker(), { frames: this.frames, lastFrame: this.lastFrame });
    this.teams = { home: { name: home }, away: { name: away } };
  }

  private readClock(clock: string | null) {
    const minute = parseClock(clock);
    if (minute === null) return;
    // Small forward steps are normal play; any other jump (a misread, or seeking the video) must be read twice in a row.
    if (!this.clockSeen || (minute >= this.minute && minute <= this.minute + 2) || minute === this.pendingMinute) {
      this.minute = minute;
      this.clockSeen = true;
      this.pendingMinute = null;
    } else {
      this.pendingMinute = minute;
    }
  }

  private readScore(r: ScreenRead) {
    const next = { home: r.home_score!, away: r.away_score! };
    // Joined mid-match: goals before the first read weren't seen, so they get no events.
    if (!this.scoreSeen) {
      this.scoreSeen = true;
      this.score = next;
      return;
    }
    if (next.home === this.score.home && next.away === this.score.away) {
      this.pendingScore = null;
      return;
    }
    // A change counts once a second frame agrees, so one misread digit can't fake a goal.
    const key = `${next.home}-${next.away}`;
    if (this.pendingScore !== key) {
      this.pendingScore = key;
      return;
    }
    this.pendingScore = null;
    for (const side of ['home', 'away'] as Side[]) {
      // Goals come from the scoreboard changing, so each goal is counted exactly once.
      for (let g = this.score[side]; g < next[side]; g++) {
        const scorer = r.event === 'goal' && r.event_team === side ? r.event_player ?? undefined : undefined;
        this.addEvent('goal', side, scorer, `Goal! ${scorer ?? this.teams![side].name}`);
      }
      // A lower score means a goal was ruled out (VAR): drop the latest goal for that side.
      for (let g = this.score[side]; g > next[side]; g--) {
        const idx = this.events.findLastIndex((e) => e.type === 'goal' && e.side === side);
        if (idx >= 0) this.events.splice(idx, 1);
      }
      this.score[side] = next[side];
    }
  }

  private readStats(r: ScreenRead) {
    const s = r.stats;
    const pairs: [keyof OnScreen, number | null, number | null][] = [
      ['possession', s.possession_home, s.possession_away],
      ['shots', s.shots_home, s.shots_away],
      ['shotsOnTarget', s.shots_on_target_home, s.shots_on_target_away],
      ['corners', s.corners_home, s.corners_away],
      ['fouls', s.fouls_home, s.fouls_away],
      ['xg', s.xg_home, s.xg_away],
    ];
    for (const [key, h, a] of pairs) {
      if (h !== null) this.onScreen.home[key] = h;
      if (a !== null) this.onScreen.away[key] = a;
    }
  }

  private addEvent(type: EventType, side: Side, player: string | undefined, text: string) {
    this.events.push({ id: this.events.length ? this.events[this.events.length - 1].id + 1 : 1, minute: this.minute, type, side, player, text });
  }

  toMatch(): BaseMatch {
    const teams = this.teams ?? { home: { name: 'Home' }, away: { name: 'Away' } };
    const sampled = this.possession.home + this.possession.away;
    const homePossession = this.onScreen.home.possession ?? (sampled ? Math.round((this.possession.home / sampled) * 100) : 50);
    const count = (side: Side, type: EventType) => this.events.filter((e) => e.side === side && e.type === type).length;

    const stats = (side: Side): TeamStats => {
      const os = this.onScreen[side];
      const shots = os.shots ?? this.chances[side];
      return {
        possession: os.possession ?? (side === 'home' ? homePossession : 100 - homePossession),
        shots,
        shotsOnTarget: Math.min(shots, os.shotsOnTarget ?? 0),
        xg: os.xg ?? Math.round(this.chances[side] * XG_PER_CHANCE * 100) / 100,
        fouls: os.fouls ?? 0,
        corners: os.corners ?? count(side, 'corner'),
        offsides: count(side, 'offside'),
        passAccuracy: 0,
        yellowCards: count(side, 'yellow'),
        redCards: count(side, 'red'),
        dangerousAttacks: this.danger[side],
        pressing: 50,
        passingLanes: 50,
        attackZones: { left: 33, center: 34, right: 33 },
      };
    };
    // "MCI" stays, "Man City" -> "MC" and "Man United" -> "MU" (not both "MAN"), "Arsenal" -> "ARS".
    const shortName = (name: string) => {
      const words = name.trim().split(/\s+/);
      if (name.length <= 4) return name.toUpperCase();
      return (words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : name.slice(0, 3)).toUpperCase();
    };
    const team = (side: Side) => ({
      name: teams[side].name,
      short: shortName(teams[side].name),
      formation: '',
      color: teams[side].color ?? (side === 'home' ? '#38bdf8' : '#fb923c'),
      stats: stats(side),
    });

    return {
      id: `screen-${norm(teams.home.name)}-${norm(teams.away.name)}`,
      competition: this.competition || 'From your screen',
      status: this.status,
      minute: this.minute,
      score: { ...this.score },
      home: team('home'),
      away: team('away'),
      events: [...this.events],
      players: [],
      mode: 'screen',
      estimated: true,
      // Fouls exist only once a stats graphic has shown them; until then "—" beats a made-up 0.
      missing: this.onScreen.home.fouls === undefined && this.onScreen.away.fouls === undefined ? [...MISSING, 'fouls'] : MISSING,
      screen: { frames: this.frames, caption: this.caption },
    };
  }
}

/** One line for the overlay: what the last frame showed. */
export function describeRead(r: ScreenRead) {
  if (!r.football_visible) return 'No football match in this frame';
  const board = r.home_team && r.away_team ? `${r.home_team} ${r.home_score ?? '?'}–${r.away_score ?? '?'} ${r.away_team}` : 'Scoreboard not visible';
  return [board, r.clock, r.is_replay ? 'replay' : r.attacking_team !== 'none' ? `${r.attacking_team === 'home' ? r.home_team ?? 'home' : r.away_team ?? 'away'} attacking` : '']
    .filter(Boolean)
    .join(' · ');
}
