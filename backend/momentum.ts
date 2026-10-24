import type { MomentumPoint, Side } from '../src/types/match';
import type { BaseMatch } from './normalize';

interface Snapshot {
  minute: number;
  xg: number;
  shots: number;
  dangerous: number;
  corners: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snap = (m: BaseMatch, side: Side): Snapshot => {
  const s = m[side].stats;
  return { minute: m.minute, xg: s.xg, shots: s.shots, dangerous: s.dangerousAttacks, corners: s.corners };
};

/**
 * Builds the momentum series from successive snapshots: each new minute's attacking threat is the delta in
 * xG / shots / dangerous attacks / corners, smoothed with an EMA. Works for any provider that reports those totals.
 */
export class MomentumTracker {
  private matchId = '';
  private prev: Record<Side, Snapshot> | null = null;
  private ema = { home: 0, away: 0 };
  private points: MomentumPoint[] = [];

  push(m: BaseMatch): MomentumPoint[] {
    const last = this.prev?.home.minute ?? -1;
    if (m.id !== this.matchId || m.minute < last) {
      this.matchId = m.id;
      this.prev = null;
      this.ema = { home: 0, away: 0 };
      this.points = [];
    }
    const cur = { home: snap(m, 'home'), away: snap(m, 'away') };
    const prev = this.prev ?? { home: { ...cur.home, minute: 0, xg: 0, shots: 0, dangerous: 0, corners: 0 }, away: { ...cur.away, minute: 0, xg: 0, shots: 0, dangerous: 0, corners: 0 } };
    const dt = m.minute - prev.home.minute;
    if (dt > 0) {
      const threat = (side: Side) => {
        const a = cur[side];
        const b = prev[side];
        const perMinute = ((a.xg - b.xg) * 60 + (a.shots - b.shots) * 5 + (a.dangerous - b.dangerous) * 3 + (a.corners - b.corners) * 4) / dt;
        return clamp(perMinute * 8, 0, 100);
      };
      this.ema.home = this.ema.home * 0.5 + threat('home') * 0.5;
      this.ema.away = this.ema.away * 0.5 + threat('away') * 0.5;
      const home = Math.round(this.ema.home);
      const away = Math.round(this.ema.away);
      this.points.push({ minute: m.minute, home, away, net: home - away, territory: m.home.stats.possession });
      this.prev = cur;
    }
    return [...this.points];
  }
}
