import { buildInsights } from '../backend/insights';
import { MomentumTracker } from '../backend/momentum';
import { fromApiFootball } from '../backend/normalize';
import { MatchSimulator } from '../backend/providers/simulator';
import type { ScreenRead } from '../backend/vision';
import type { Match } from '../src/types/match';

/** A fully enriched demo Match after `minutes` simulated minutes. */
export function makeMatch(minutes = 40, seed = 7): Match {
  const sim = new MatchSimulator(seed);
  const tracker = new MomentumTracker();
  let base = fromApiFootball(sim.snapshot());
  let momentum = tracker.push(base);
  for (let i = 0; i < minutes; i++) {
    sim.step();
    base = fromApiFootball(sim.snapshot());
    momentum = tracker.push(base);
  }
  const { insights, summary } = buildInsights({ ...base, momentum });
  return { ...base, momentum, insights, summary, updatedAt: 0 };
}

/** No stat graphic on screen. */
export const noStats: ScreenRead['stats'] = {
  possession_home: null, possession_away: null, shots_home: null, shots_away: null,
  shots_on_target_home: null, shots_on_target_away: null, corners_home: null, corners_away: null,
  fouls_home: null, fouls_away: null, xg_home: null, xg_away: null,
};

/** One frame as the vision model reads it: MCI 0-0 ARS at 10:00, home in possession. Override per test. */
export const screenRead = (over: Partial<ScreenRead> = {}): ScreenRead => ({
  football_visible: true, is_replay: false, competition: 'Premier League',
  home_team: 'MCI', away_team: 'ARS', home_score: 0, away_score: 0, clock: '10:00',
  period: 'first_half', home_color: '#6cabdd', away_color: '#ef4444',
  possession: 'home', attacking_team: 'none', danger: 'none',
  event: 'none', event_team: 'unknown', event_player: null, stats: noStats, caption: 'City keep the ball.',
  ...over,
});
