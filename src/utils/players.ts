import type { PlayerStat } from '../types/match';

const best = (players: PlayerStat[], score: (p: PlayerStat) => number) =>
  players.reduce<PlayerStat | undefined>((top, p) => (score(p) > (top ? score(top) : 0) ? p : top), undefined);

/** Weighted involvement score used for "most involved" and the impact table. */
export const impact = (p: PlayerStat) =>
  p.touches * 0.2 + p.passes * 0.1 + p.dribbles * 2 + p.tackles * 2 + p.interceptions * 2 + p.shots * 3;

export function topPlayers(players: PlayerStat[]) {
  return {
    passer: best(players, (p) => p.passes),
    dribbler: best(players, (p) => (p.dribbles ? p.dribbles * 1000 + p.touches : 0)),
    defender: best(players, (p) => (p.position === 'FW' ? 0 : p.tackles + p.interceptions)),
    involved: best(players, impact),
  };
}
