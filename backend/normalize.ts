import type { DataMode, EventType, Match, MatchEvent, PlayerStat, Side, Team, TeamStats } from '../src/types/match';
import type { ApiFootballLike, FootballDataMatch } from './raw';

/** Normalizer output; momentum, insights and summary are added by the hub. */
export type BaseMatch = Omit<Match, 'momentum' | 'insights' | 'summary' | 'notice' | 'updatedAt'>;

const KNOWN_COLORS: Record<string, string> = {
  'Manchester City': '#6cabdd',
  Arsenal: '#ef4444',
};
const FALLBACK_COLORS: Record<Side, string> = { home: '#38bdf8', away: '#fb923c' };
const colorFor = (name: string, side: Side) => KNOWN_COLORS[name] ?? FALLBACK_COLORS[side];

const num = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- API-Football-shaped feed (demo simulator / tracking feed) ----------

function teamStats(entries: { type: string; value: number | string | null }[]): TeamStats {
  const by = new Map(entries.map((e) => [e.type, e.value]));
  const get = (t: string) => num(by.get(t));
  return {
    possession: get('Ball Possession'),
    shots: get('Total Shots'),
    shotsOnTarget: get('Shots on Goal'),
    xg: Math.round(get('expected_goals') * 100) / 100,
    fouls: get('Fouls'),
    corners: get('Corner Kicks'),
    offsides: get('Offsides'),
    passAccuracy: get('Passes %'),
    yellowCards: get('Yellow Cards'),
    redCards: get('Red Cards'),
    dangerousAttacks: get('Dangerous Attacks'),
    pressing: get('Pressing Intensity'),
    passingLanes: get('Progressive Passes %'),
    attackZones: { left: get('Attacks Left %'), center: get('Attacks Center %'), right: get('Attacks Right %') },
  };
}

function eventType(e: ApiFootballLike['events'][number]): EventType {
  switch (e.type) {
    case 'Goal': return 'goal';
    case 'Card': return /yellow/i.test(e.detail) && !/second/i.test(e.detail) ? 'yellow' : 'red';
    case 'subst': return 'sub';
    case 'Shot': return 'shot';
    case 'Corner': return 'corner';
    case 'Foul': return 'foul';
    default: return 'offside';
  }
}

function eventText(type: EventType, e: ApiFootballLike['events'][number]): string {
  const p = e.player.name;
  switch (type) {
    case 'goal': return `Goal! ${p}`;
    case 'yellow': return `Yellow card — ${p}`;
    case 'red': return `Red card — ${p}`;
    case 'sub': return e.detail;
    case 'shot': return `${p} — ${e.detail.toLowerCase()}`;
    case 'corner': return `Corner to ${e.team.name}`;
    case 'foul': return `Foul by ${p}`;
    case 'offside': return `${p} flagged offside`;
  }
}

const POS = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' } as const;

export function fromApiFootball(raw: ApiFootballLike, mode: DataMode = 'demo'): BaseMatch {
  const teamOf = (side: Side): Team => {
    const t = raw.teams[side];
    const stats = raw.statistics.find((s) => s.team.name === t.name);
    return {
      name: t.name,
      short: t.code,
      formation: raw.lineups.find((l) => l.team.name === t.name)?.formation ?? '',
      color: colorFor(t.name, side),
      stats: teamStats(stats?.statistics ?? []),
    };
  };
  const sideOf = (name: string): Side => (name === raw.teams.home.name ? 'home' : 'away');

  const events: MatchEvent[] = raw.events.map((e, i) => {
    const type = eventType(e);
    return { id: i + 1, minute: e.time.elapsed, type, side: sideOf(e.team.name), player: e.player.name, text: eventText(type, e), xg: e.xg };
  });

  const players: PlayerStat[] = raw.players.flatMap((tp) =>
    tp.players.map((p) => ({
      name: p.player.name,
      side: sideOf(tp.team.name),
      number: p.player.number,
      position: POS[p.player.pos],
      onPitch: p.onPitch,
      touches: p.statistics.touches,
      passes: p.statistics.passes.total,
      passAccuracy: p.statistics.passes.total ? Math.round((p.statistics.passes.accurate / p.statistics.passes.total) * 100) : 0,
      dribbles: p.statistics.dribbles.success,
      tackles: p.statistics.tackles.total,
      interceptions: p.statistics.tackles.interceptions,
      shots: p.statistics.shots.total,
    })),
  );

  const short = raw.fixture.status.short;
  return {
    id: String(raw.fixture.id),
    competition: raw.league.name,
    status: short === 'HT' ? 'halftime' : short === 'FT' ? 'finished' : 'live',
    minute: raw.fixture.status.elapsed,
    score: { ...raw.goals },
    home: teamOf('home'),
    away: teamOf('away'),
    events,
    players,
    mode,
    estimated: false,
  };
}

// ---------- football-data.org ----------

/** Elapsed minute from kickoff when the API omits `minute` (free tier). Subtracts a 15 min break after 45'. */
export function estimateMinute(utcDate: string, now: number): number {
  const elapsed = Math.floor((now - Date.parse(utcDate)) / 60000);
  return clamp(elapsed > 60 ? elapsed - 15 : elapsed, 1, 120);
}

/** The free tier has no possession/shots/xG, so those are derived from score and minute and flagged `estimated`. */
function estimatedStats(goals: number, conceded: number, minute: number, yellow: number, red: number): TeamStats {
  const shots = Math.round(minute / 9 + goals * 2.5);
  return {
    possession: clamp(50 + (goals - conceded) * 4, 35, 65),
    shots,
    shotsOnTarget: Math.min(shots, goals + Math.round(shots * 0.25)),
    xg: Math.round((goals * 0.8 + (minute / 90) * 0.6) * 100) / 100,
    fouls: Math.round(minute / 8),
    corners: Math.round(minute / 14),
    offsides: Math.round(minute / 30),
    passAccuracy: 82,
    yellowCards: yellow,
    redCards: red,
    dangerousAttacks: Math.round(minute / 3 + goals * 3),
    pressing: 50,
    passingLanes: 45,
    attackZones: { left: 33, center: 34, right: 33 },
  };
}

export function fromFootballData(m: FootballDataMatch, now = Date.now()): BaseMatch {
  const homeName = m.homeTeam.name;
  const sideOf = (name: string): Side => (name === homeName ? 'home' : 'away');
  const score = { home: m.score.fullTime.home ?? 0, away: m.score.fullTime.away ?? 0 };
  const minute = m.minute ?? (m.status === 'PAUSED' ? 45 : m.status === 'FINISHED' ? 90 : estimateMinute(m.utcDate, now));

  const raw: Omit<MatchEvent, 'id'>[] = [
    ...(m.goals ?? []).map((g) => ({ minute: g.minute, type: 'goal' as const, side: sideOf(g.team.name), player: g.scorer?.name, text: `Goal! ${g.scorer?.name ?? g.team.name}` })),
    ...(m.bookings ?? []).map((b) => {
      const type = /yellow/i.test(b.card) && !/red/i.test(b.card) ? ('yellow' as const) : ('red' as const);
      return { minute: b.minute, type, side: sideOf(b.team.name), player: b.player?.name, text: `${type === 'yellow' ? 'Yellow' : 'Red'} card — ${b.player?.name ?? b.team.name}` };
    }),
    ...(m.substitutions ?? []).map((s) => ({ minute: s.minute, type: 'sub' as const, side: sideOf(s.team.name), player: s.playerIn?.name, text: `${s.playerIn?.name ?? '?'} replaces ${s.playerOut?.name ?? '?'}` })),
  ];
  const events = raw.sort((a, b) => a.minute - b.minute).map((e, i) => ({ ...e, id: i + 1 }));
  const cards = (side: Side, type: EventType) => events.filter((e) => e.side === side && e.type === type).length;

  const team = (side: Side): Team => {
    const t = side === 'home' ? m.homeTeam : m.awayTeam;
    const other: Side = side === 'home' ? 'away' : 'home';
    return {
      name: t.name,
      short: t.tla ?? t.shortName ?? t.name.slice(0, 3).toUpperCase(),
      formation: '',
      color: colorFor(t.name, side),
      stats: estimatedStats(score[side], score[other], minute, cards(side, 'yellow'), cards(side, 'red')),
    };
  };

  return {
    id: String(m.id),
    competition: m.competition.name,
    status: m.status === 'PAUSED' ? 'halftime' : m.status === 'FINISHED' ? 'finished' : 'live',
    minute,
    score,
    home: team('home'),
    away: team('away'),
    events,
    players: [],
    mode: 'live',
    estimated: true,
    // These estimates depend only on the minute, so both teams get the same made-up number: show "—" instead.
    missing: ['fouls', 'corners', 'offsides', 'passAccuracy', 'pressing', 'passingLanes', 'attackZones'],
  };
}
