import { describe, expect, it } from 'vitest';
import { MomentumTracker } from '../backend/momentum';
import { fromApiFootball } from '../backend/normalize';
import { MatchSimulator } from '../backend/providers/simulator';

const run = (seed: number, steps: number) => {
  const sim = new MatchSimulator(seed);
  for (let i = 0; i < steps; i++) sim.step();
  return sim;
};

describe('MatchSimulator', () => {
  it('is deterministic for a given seed and differs across seeds', () => {
    expect(run(5, 60).snapshot()).toEqual(run(5, 60).snapshot());
    expect(run(5, 60).snapshot()).not.toEqual(run(6, 60).snapshot());
  });

  it('holds stat invariants at every minute of a full match', () => {
    const sim = new MatchSimulator(3);
    let lastMinute = 0;
    while (!sim.finished) {
      sim.step();
      const m = fromApiFootball(sim.snapshot());
      for (const t of [m.home, m.away]) {
        expect(t.stats.xg).toBeGreaterThanOrEqual(0);
        expect(t.stats.shotsOnTarget).toBeLessThanOrEqual(t.stats.shots);
        expect(t.stats.passAccuracy).toBeLessThanOrEqual(100);
      }
      expect(m.home.stats.possession + m.away.stats.possession).toBe(100);
      expect(m.minute).toBeGreaterThanOrEqual(lastMinute);
      lastMinute = m.minute;
    }
    expect(lastMinute).toBeGreaterThanOrEqual(92);
    expect(fromApiFootball(sim.snapshot()).status).toBe('finished');
  });

  it('pauses at half-time without advancing the clock, then resumes', () => {
    const sim = run(1, 45);
    sim.step();
    expect(fromApiFootball(sim.snapshot()).status).toBe('halftime');
    expect(sim.minute).toBe(45);
    sim.step();
    expect(sim.minute).toBe(46);
    expect(fromApiFootball(sim.snapshot()).status).toBe('live');
  });
});

describe('MomentumTracker', () => {
  it('adds one bounded point per new minute and resets when the match restarts', () => {
    const sim = new MatchSimulator(9);
    const tracker = new MomentumTracker();
    let points = tracker.push(fromApiFootball(sim.snapshot()));
    for (let i = 0; i < 30; i++) {
      sim.step();
      points = tracker.push(fromApiFootball(sim.snapshot()));
    }
    expect(points).toHaveLength(30);
    expect(points.every((p) => p.home >= 0 && p.home <= 100 && p.away >= 0 && p.away <= 100)).toBe(true);
    expect(points.every((p) => p.net === p.home - p.away)).toBe(true);

    // A fresh match at minute 1 (clock went backwards) starts a new series.
    const fresh = new MatchSimulator(10);
    fresh.step();
    expect(tracker.push(fromApiFootball(fresh.snapshot()))).toHaveLength(1);
  });

  it('does not add a point when the minute has not changed (e.g. a repeat poll)', () => {
    const sim = new MatchSimulator(2);
    const tracker = new MomentumTracker();
    sim.step();
    const base = fromApiFootball(sim.snapshot());
    tracker.push(base);
    expect(tracker.push(base)).toHaveLength(1);
  });
});
