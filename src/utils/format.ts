import type { MatchStatus, MomentumPoint, Side } from '../types/match';

export function minuteLabel(minute: number, status: MatchStatus) {
  if (status === 'halftime') return 'HT';
  if (status === 'finished') return 'FT';
  return minute > 90 ? `90+${minute - 90}'` : `${minute}'`;
}

/** Share of `a` in `a + b`, 0-100; 50 when both are zero. */
export const share = (a: number, b: number) => (a + b === 0 ? 50 : (a / (a + b)) * 100);

/** A side is "in flow" when its own attacking threat averages 50 or more over the last 3 minutes. */
export const inFlow = (momentum: MomentumPoint[], side: Side) =>
  momentum.length >= 3 && momentum.slice(-3).reduce((sum, p) => sum + p[side], 0) / 3 >= 50;
