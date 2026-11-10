import type { MatchStatus, MomentumPoint, Side } from '../types/match';

export function minuteLabel(minute: number, status: MatchStatus, extraTime = false) {
  if (status === 'halftime') return 'HT';
  if (status === 'finished') return 'FT';
  // Added time follows the end of normal time, or of extra time.
  const end = extraTime ? 120 : 90;
  return minute > end ? `${end}+${minute - end}'` : `${minute}'`;
}

/** Share of `a` in `a + b`, 0-100; 50 when both are zero. */
export const share = (a: number, b: number) => (a + b === 0 ? 50 : (a / (a + b)) * 100);

/** A side is "in flow" when its own attacking threat averages 50 or more over the last 3 minutes. */
export const inFlow = (momentum: MomentumPoint[], side: Side) =>
  momentum.length >= 3 && momentum.slice(-3).reduce((sum, p) => sum + p[side], 0) / 3 >= 50;
