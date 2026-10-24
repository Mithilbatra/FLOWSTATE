// Provider payload shapes, before normalization.

/** Modelled on API-Football's fixture/statistics/events responses, extended with a tracking feed. */
export interface ApiFootballLike {
  fixture: { id: number; status: { short: '1H' | 'HT' | '2H' | 'FT'; elapsed: number } };
  league: { name: string };
  teams: { home: { name: string; code: string }; away: { name: string; code: string } };
  goals: { home: number; away: number };
  statistics: { team: { name: string }; statistics: { type: string; value: number | string | null }[] }[];
  events: {
    time: { elapsed: number };
    team: { name: string };
    player: { name: string };
    type: 'Goal' | 'Card' | 'subst' | 'Shot' | 'Corner' | 'Foul' | 'Offside';
    detail: string;
    xg?: number;
  }[];
  lineups: { team: { name: string }; formation: string }[];
  players: {
    team: { name: string };
    players: {
      player: { name: string; number: number; pos: 'G' | 'D' | 'M' | 'F' };
      onPitch: boolean;
      statistics: {
        touches: number;
        passes: { total: number; accurate: number };
        dribbles: { success: number };
        tackles: { total: number; interceptions: number };
        shots: { total: number };
      };
    }[];
  }[];
}

/** football-data.org v4 match resource (the parts we read). Goals/bookings/substitutions need a paid tier on some competitions. */
export interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: 'TIMED' | 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | string;
  minute?: number | null;
  competition: { name: string };
  homeTeam: { name: string; shortName?: string; tla?: string };
  awayTeam: { name: string; shortName?: string; tla?: string };
  score: { fullTime: { home: number | null; away: number | null } };
  goals?: { minute: number; team: { name: string }; scorer?: { name: string } }[];
  bookings?: { minute: number; team: { name: string }; player?: { name: string }; card: string }[];
  substitutions?: { minute: number; team: { name: string }; playerIn?: { name: string }; playerOut?: { name: string } }[];
}
