import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import type { Match, TeamStats } from '../types/match';
import { share } from '../utils/format';
import { StatRow } from './StatRow';

const pct = (n: number) => `${Math.round(n)}%`;

export function TeamComparison({ match }: { match: Match }) {
  const { home, away } = match;
  const h = home.stats;
  const a = away.stats;
  const missing = (key: keyof TeamStats) => match.missing?.includes(key) ?? false;
  const axes = (
    [
      { k: 'Possession', key: 'possession', h: h.possession, a: a.possession },
      { k: 'Danger', key: 'dangerousAttacks', h: share(h.dangerousAttacks, a.dangerousAttacks), a: share(a.dangerousAttacks, h.dangerousAttacks) },
      { k: 'Pressing', key: 'pressing', h: h.pressing, a: a.pressing },
      { k: 'Passing lanes', key: 'passingLanes', h: h.passingLanes, a: a.passingLanes },
      { k: 'Shot quality', key: 'xg', h: share(h.xg, a.xg), a: share(a.xg, h.xg) },
      { k: 'Accuracy', key: 'passAccuracy', h: h.passAccuracy, a: a.passAccuracy },
    ] as const
  ).filter((x) => !missing(x.key));
  const props = { homeColor: home.color, awayColor: away.color };

  return (
    <section className="glass panel" aria-labelledby="compare-title">
      <h2 id="compare-title">Head to head</h2>
      <div className="chart" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={axes} outerRadius="72%">
            <PolarGrid stroke="rgba(70,140,255,.25)" />
            <PolarAngleAxis dataKey="k" tick={{ fill: '#b8c8ea', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name={home.short} dataKey="h" stroke={home.color} fill={home.color} fillOpacity={0.3} isAnimationActive={false} />
            <Radar name={away.short} dataKey="a" stroke={away.color} fill={away.color} fillOpacity={0.3} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <StatRow label="Dangerous attacks" home={h.dangerousAttacks} away={a.dangerousAttacks} {...props} />
      <StatRow label="Pressing intensity" home={h.pressing} away={a.pressing} missing={missing('pressing')} {...props} />
      <StatRow label="Possession share" home={h.possession} away={a.possession} format={pct} {...props} />
      <StatRow label="Passing lanes (progressive %)" home={h.passingLanes} away={a.passingLanes} format={pct} missing={missing('passingLanes')} {...props} />
    </section>
  );
}
