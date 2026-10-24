import type { Insight, MomentumPoint, Side } from '../src/types/match';
import { minuteLabel } from '../src/utils/format';
import type { BaseMatch } from './normalize';

type Candidate = { priority: number; insight: Insight };
type Zone = 'left' | 'center' | 'right';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Rule-based "analyst": turns stats and momentum into short natural-language insights. */
export function buildInsights(m: BaseMatch & { momentum: MomentumPoint[] }): { insights: Insight[]; summary: string } {
  const c: Candidate[] = [];
  const team = (s: Side) => m[s];
  const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
  const add = (priority: number, insight: Insight) => c.push({ priority, insight });

  // Possession
  const diff = m.home.stats.possession - m.away.stats.possession;
  if (Math.abs(diff) >= 10) {
    const s: Side = diff > 0 ? 'home' : 'away';
    add(Math.abs(diff) >= 16 ? 80 : 70, {
      id: 'possession', tone: 'positive', side: s, title: 'Midfield control',
      text: `${team(s).name} are dominating possession in midfield (${team(s).stats.possession}%, ${team(s).stats.passAccuracy}% pass accuracy).`,
    });
  }

  // Hottest attacking channel
  let best: { side: Side; zone: Zone; share: number } | null = null;
  for (const s of ['home', 'away'] as Side[]) {
    if (team(s).stats.dangerousAttacks < 6) continue;
    for (const zone of ['left', 'center', 'right'] as Zone[]) {
      const share = team(s).stats.attackZones[zone];
      if (share >= 42 && (!best || share > best.share)) best = { side: s, zone, share };
    }
  }
  if (best) {
    const area = best.zone === 'center' ? 'middle' : `${best.zone} side`;
    add(65, {
      id: 'zone', tone: 'neutral', side: best.side,
      title: best.zone === 'center' ? 'Play through the middle' : `The ${best.zone} side is the danger zone`,
      text: `The ${area} is becoming the most dangerous area — ${team(best.side).name} are directing ${best.share}% of their attacks there.`,
    });
  }

  // Momentum
  if (m.momentum.length >= 8) {
    const nets = m.momentum.map((p) => p.net);
    const recent = avg(nets.slice(-5));
    const before = avg(nets.slice(-15, -5));
    const s: Side = recent > 0 ? 'home' : 'away';
    // A shift toward a side needs the change to point that way too (+40 -> +15 is a shift away from home).
    if (Math.abs(recent - before) >= 12 && Math.abs(recent) >= 10 && Math.sign(recent - before) === Math.sign(recent)) {
      add(85, { id: 'momentum', tone: 'positive', side: s, title: 'Momentum shift', text: `Momentum is shifting toward ${team(s).name}, who have created the better chances in the last five minutes.` });
    } else if (Math.abs(recent) >= 20) {
      add(75, { id: 'momentum', tone: 'positive', side: s, title: 'Sustained pressure', text: `${team(s).name} have the upper hand over the last five minutes.` });
    }
    // Flow: a side's own threat stays high for three straight minutes.
    for (const side of ['home', 'away'] as Side[]) {
      if (avg(m.momentum.slice(-3).map((p) => p[side])) >= 50) {
        add(78, { id: `flow-${side}`, tone: 'positive', side, title: `${team(side).short} entered FLOW`, text: `${team(side).name} are in the zone: wave after wave of attacks, every touch heading for goal.` });
      }
    }
  }

  // xG vs scoreline
  for (const s of ['home', 'away'] as Side[]) {
    const gap = team(s).stats.xg - m.score[s];
    if (m.minute >= 20 && gap >= 0.9) {
      add(60, { id: `xg-${s}`, tone: 'warning', side: s, title: 'Wasteful in front of goal', text: `${team(s).name} have ${team(s).stats.xg.toFixed(1)} xG but only ${m.score[s]} goal${m.score[s] === 1 ? '' : 's'} — the finishing is not matching the chances.` });
    } else if (m.minute >= 20 && -gap >= 1) {
      add(55, { id: `xg-${s}`, tone: 'neutral', side: s, title: 'Clinical finishing', text: `${team(s).name} have outscored their chances: ${m.score[s]} goals from ${team(s).stats.xg.toFixed(1)} xG.` });
    }
  }

  // Pressing
  const pd = m.home.stats.pressing - m.away.stats.pressing;
  if (Math.abs(pd) >= 15) {
    const s: Side = pd > 0 ? 'home' : 'away';
    add(40, { id: 'pressing', tone: 'neutral', side: s, title: 'High press', text: `${team(s).name} are pressing much higher (${team(s).stats.pressing} vs ${team(other(s)).stats.pressing} intensity), forcing the build-up.` });
  }

  // Discipline
  const reds = { home: m.home.stats.redCards, away: m.away.stats.redCards };
  const yellows = m.home.stats.yellowCards + m.away.stats.yellowCards;
  if (reds.home !== reds.away) {
    const s: Side = reds.home > reds.away ? 'home' : 'away';
    const players = 11 - reds[s];
    add(90, { id: 'red', tone: 'warning', side: s, title: `Down to ${players}`, text: `${team(s).name} are playing with ${players} men, which should shift the balance of play.` });
  } else if (reds.home > 0) {
    add(60, { id: 'red', tone: 'warning', title: `${11 - reds.home} v ${11 - reds.away}`, text: 'Both sides have had a player sent off, so expect more space on the pitch.' });
  } else if (yellows >= 3) {
    add(50, { id: 'cards', tone: 'warning', title: 'Bookings piling up', text: `${yellows} yellow cards already — the referee is keeping a tight leash.` });
  }

  // Late game
  if (m.status === 'live' && m.minute >= 75 && Math.abs(m.score.home - m.score.away) <= 1) {
    add(45, { id: 'late', tone: 'neutral', title: 'Tension in the final stretch', text: 'The game is still in the balance, so expect substitutions and risk-taking.' });
  }

  if (c.length === 0) {
    add(10, { id: 'balanced', tone: 'neutral', title: 'Evenly balanced', text: 'Neither side has taken control yet; the stats are close across the board.' });
  }

  const top = c.sort((a, b) => b.priority - a.priority).slice(0, 4).map((x) => x.insight);
  const head = `${minuteLabel(m.minute, m.status)} · ${m.home.name} ${m.score.home}–${m.score.away} ${m.away.name}.`;
  return { insights: top, summary: [head, ...top.slice(0, 2).map((i) => i.text)].join(' ') };
}
