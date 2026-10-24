// App schema shared by the backend (normalizer output) and the frontend.

/** demo = simulator, live = football-data.org, screen = read from the user's shared screen by a vision model (Claude or Gemini) */
export type DataMode = 'demo' | 'live' | 'screen';
export type Side = 'home' | 'away';
export type MatchStatus = 'live' | 'halftime' | 'finished';
export type EventType = 'goal' | 'yellow' | 'red' | 'sub' | 'foul' | 'shot' | 'corner' | 'offside';

export interface AttackZones {
  left: number;
  center: number;
  right: number;
}

export interface TeamStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  fouls: number;
  corners: number;
  offsides: number;
  passAccuracy: number;
  yellowCards: number;
  redCards: number;
  dangerousAttacks: number;
  /** 0-100 */
  pressing: number;
  /** Share of passes that progress play, 0-100 */
  passingLanes: number;
  /** Share of attacks per channel, sums to ~100 */
  attackZones: AttackZones;
}

export interface Team {
  name: string;
  short: string;
  formation: string;
  color: string;
  stats: TeamStats;
}

export interface MatchEvent {
  id: number;
  minute: number;
  type: EventType;
  side: Side;
  player?: string;
  text: string;
  xg?: number;
}

export interface MomentumPoint {
  minute: number;
  home: number;
  away: number;
  /** home - away, -100..100 */
  net: number;
  /** home possession share at this minute */
  territory: number;
}

export interface PlayerStat {
  name: string;
  side: Side;
  number: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  onPitch: boolean;
  touches: number;
  passes: number;
  passAccuracy: number;
  dribbles: number;
  tackles: number;
  interceptions: number;
  shots: number;
}

export interface Insight {
  id: string;
  tone: 'positive' | 'warning' | 'neutral';
  title: string;
  text: string;
  side?: Side;
}

export interface Match {
  id: string;
  competition: string;
  status: MatchStatus;
  /** Match minute; can exceed 90 in stoppage time */
  minute: number;
  score: { home: number; away: number };
  home: Team;
  away: Team;
  events: MatchEvent[];
  momentum: MomentumPoint[];
  players: PlayerStat[];
  insights: Insight[];
  summary: string;
  mode: DataMode;
  /** True when some stats are derived estimates rather than provider data */
  estimated: boolean;
  /** Stats this source cannot measure at all; the UI shows "—" instead of a number */
  missing?: (keyof TeamStats)[];
  /** Screen-analysis status, present in screen mode */
  screen?: { frames: number; caption: string };
  /** Human-readable degradation notice, e.g. why demo data is showing */
  notice?: string;
  updatedAt: number;
}
