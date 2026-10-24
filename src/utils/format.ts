import type { MatchStatus } from '../types/match';

export function minuteLabel(minute: number, status: MatchStatus) {
  if (status === 'halftime') return 'HT';
  if (status === 'finished') return 'FT';
  return minute > 90 ? `90+${minute - 90}'` : `${minute}'`;
}

/** Share of `a` in `a + b`, 0-100; 50 when both are zero. */
export const share = (a: number, b: number) => (a + b === 0 ? 50 : (a / (a + b)) * 100);
