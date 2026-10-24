import type { EventType, MatchEvent, Side, TeamStats } from '../src/types/match';
import type { BaseMatch } from './normalize';
import type { ScreenRead } from './vision';

/** Without a recognised frame for this long, screen mode lapses and the previous source shows again. */
const STALE_MS = 60_000;
/** The same card/sub/corner graphic stays on screen across frames; count it once. */
const EVENT_DEDUPE_MS = 90_000;

const EVENT_MAP: Partial<Record<ScreenRead['event'], EventType>> = {
  yellow_card: 'yellow', red_card: 'red', substitution: 'sub', corner: 'corner', offside: 'offside',
};
const EVENT_TEXT: Partial<Record<EventType, string>> = {
  yellow: 'Yellow card', red: 'Red card', sub: 'Substitution', corner: 'Corner', offside: 'Offside',
};
// Stats that a broadcast frame cannot show; the UI renders them as "—".
const MISSING: (keyof TeamStats)[] = ['passAccuracy', 'pressing', 'passingLanes', 'attackZones', 'offsides'];
const XG_PER_CHANCE = 0.12;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isHex = (s: string | null): s is string => !!s && /^#[0-9a-f]{6}$/i.test(s);

/** "67:12" -> 68, "45+2" -> 47, "34'" -> 34. Null when unreadable. */
export function parseClock(clock: string | null): number | null {
  if (!clock) return null;
  const added = clock.match(/(\d{1,3})\s*\+\s*(\d{1,2})/);
  if (added) return Number(added[1]) + Number(added[2]);
  const mmss = clock.match(/(\d{1,3}):(\d{2})/);
  if (mmss) return Math.max(1, Number(mmss[1]) + (Number(mmss[2]) > 0 ? 1 : 0));
  const bare = clock.match(/^\s*(\d{1,3})'?\s*$/);
  return bare ? Number(bare[1]) : null;
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

  /** Teams are known and a match was recognised recently. */
  detected(now = Date.now()) {
    return this.teams !== null && now - this.lastSeen < STALE_MS;
  }

  apply(r: ScreenRead, now = Date.now()) {
    this.frames++;
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

    this.minute = parseClock(r.clock) ?? this.minute;
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
    if (cur && (norm(home) === norm(cur.home.name) || norm(away) === norm(cur.away.name))) return;
    // Both names changed: a different match is on screen, start over.
    Object.assign(this, new ScreenTracker(), { frames: this.frames });
    this.teams = { home: { name: home }, away: { name: away } };
  }

  private readScore(r: ScreenRead) {
    for (const side of ['home', 'away'] as Side[]) {
      const next = side === 'home' ? r.home_score! : r.away_score!;
      // Goals come from the scoreboard changing, so each goal is counted exactly once.
      for (let g = this.score[side]; g < next; g++) {
        const scorer = r.event === 'goal' && r.event_team === side ? r.event_player ?? undefined : undefined;
        this.addEvent('goal', side, scorer, `Goal! ${scorer ?? this.teams![side].name}`);
      }
      // A lower score means a goal was ruled out (VAR): drop the latest goal for that side.
      for (let g = this.score[side]; g > next; g--) {
        const idx = this.events.findLastIndex((e) => e.type === 'goal' && e.side === side);
        if (idx >= 0) this.events.splice(idx, 1);
      }
      this.score[side] = next;
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
    const team = (side: Side) => ({
      name: teams[side].name,
      short: teams[side].name.length <= 4 ? teams[side].name.toUpperCase() : teams[side].name.slice(0, 3).toUpperCase(),
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
      missing: MISSING,
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
