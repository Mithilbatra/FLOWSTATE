import { describe, expect, it } from 'vitest';
import { buildInsights } from '../backend/insights';
import type { MomentumPoint } from '../src/types/match';
import { makeMatch } from './helpers';

const base = makeMatch(1);
const withStats = (home: object, away: object, extra: object = {}) => ({
  ...base,
  minute: 50,
  score: { home: 0, away: 0 },
  ...extra,
  home: { ...base.home, stats: { ...base.home.stats, ...home } },
  away: { ...base.away, stats: { ...base.away.stats, ...away } },
  momentum: [] as MomentumPoint[],
});
const quiet = { possession: 50, dangerousAttacks: 0, xg: 0, pressing: 50, yellowCards: 0, redCards: 0, attackZones: { left: 33, center: 34, right: 33 } };

describe('buildInsights', () => {
  it('falls back to a balanced insight when nothing stands out', () => {
    const { insights } = buildInsights(withStats(quiet, quiet));
    expect(insights).toHaveLength(1);
    expect(insights[0].id).toBe('balanced');
  });

  it('flags possession dominance and names the team', () => {
    const { insights, summary } = buildInsights(withStats({ ...quiet, possession: 64 }, { ...quiet, possession: 36 }));
    const i = insights.find((x) => x.id === 'possession');
    expect(i?.side).toBe('home');
    expect(i?.text).toContain('are dominating possession in midfield');
    expect(summary).toContain(base.home.name);
  });

  it('does not quote pass accuracy or pressing when the source cannot measure them (audit #1)', () => {
    const s = withStats({ ...quiet, possession: 64, pressing: 90 }, { ...quiet, possession: 36, pressing: 40 });
    const measured = buildInsights(s).insights;
    expect(measured.find((x) => x.id === 'possession')?.text).toMatch(/pass accuracy/);
    const screenLike = buildInsights({ ...s, missing: ['passAccuracy', 'pressing'] }).insights;
    expect(screenLike.find((x) => x.id === 'possession')?.text).not.toMatch(/pass accuracy/);
    expect(screenLike.some((x) => x.id === 'pressing')).toBe(false);
  });

  it('flags the most dangerous attacking channel', () => {
    const { insights } = buildInsights(withStats(quiet, { ...quiet, dangerousAttacks: 12, attackZones: { left: 60, center: 10, right: 30 } }));
    const i = insights.find((x) => x.id === 'zone');
    expect(i?.side).toBe('away');
    expect(i?.text).toContain('left side is becoming the most dangerous area');
  });

  it('detects a momentum shift toward the side that has surged recently', () => {
    const momentum: MomentumPoint[] = Array.from({ length: 15 }, (_, i) => ({
      minute: i + 1, home: 0, away: 0, net: i < 10 ? -10 : 40, territory: 50,
    }));
    const { insights } = buildInsights({ ...withStats(quiet, quiet), momentum });
    const i = insights.find((x) => x.id === 'momentum');
    expect(i?.title).toBe('Momentum shift');
    expect(i?.side).toBe('home');
  });

  it('does not call fading home momentum a shift toward home', () => {
    const momentum: MomentumPoint[] = Array.from({ length: 15 }, (_, i) => ({
      minute: i + 1, home: 0, away: 0, net: i < 10 ? 40 : 15, territory: 50,
    }));
    const { insights } = buildInsights({ ...withStats(quiet, quiet), momentum });
    expect(insights.find((x) => x.id === 'momentum')).toBeUndefined();
  });

  it('names the side with more red cards, and handles both sides being down', () => {
    let { insights } = buildInsights(withStats({ ...quiet, redCards: 0 }, { ...quiet, redCards: 1 }));
    expect(insights.find((x) => x.id === 'red')).toMatchObject({ side: 'away', title: 'Down to 10' });
    ({ insights } = buildInsights(withStats({ ...quiet, redCards: 1 }, { ...quiet, redCards: 1 })));
    expect(insights.find((x) => x.id === 'red')).toMatchObject({ title: '10 v 10' });
  });

  it('flags a side in flow when its threat stays high', () => {
    const momentum: MomentumPoint[] = Array.from({ length: 10 }, (_, i) => ({
      minute: i + 1, home: i >= 7 ? 70 : 10, away: 5, net: 0, territory: 50,
    }));
    const { insights } = buildInsights({ ...withStats(quiet, quiet), momentum });
    expect(insights.some((x) => x.id === 'flow-home')).toBe(true);
  });

  it('calls out wasteful finishing when xG far exceeds goals', () => {
    const { insights } = buildInsights(withStats({ ...quiet, xg: 2.1 }, quiet));
    expect(insights.some((x) => x.id === 'xg-home' && x.tone === 'warning')).toBe(true);
  });

  it('ranks a red card first and caps the list at four', () => {
    const { insights } = buildInsights(
      withStats({ ...quiet, possession: 65, redCards: 1, xg: 2, pressing: 90 }, { ...quiet, possession: 35, dangerousAttacks: 10, attackZones: { left: 70, center: 10, right: 20 } }, { minute: 80 }),
    );
    expect(insights[0].id).toBe('red');
    expect(insights.length).toBeLessThanOrEqual(4);
  });
});
