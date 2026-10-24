import { buildInsights } from '../backend/insights';
import { MomentumTracker } from '../backend/momentum';
import { fromApiFootball } from '../backend/normalize';
import { MatchSimulator } from '../backend/providers/simulator';
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
