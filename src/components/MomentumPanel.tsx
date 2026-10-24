import type { CSSProperties } from 'react';
import { Area, AreaChart, Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Match, Side } from '../types/match';
import { StatRow } from './StatRow';

const axis = { fill: '#8ea2c9', fontSize: 11 };
const tooltipStyle = { background: 'rgba(2,4,11,.95)', border: '1px solid rgba(70,140,255,.35)', borderRadius: 0, fontSize: 12 };
/** Average threat over the last 3 minutes at or above this means a side is "in flow". */
const FLOW_THRESHOLD = 50;

export function MomentumPanel({ match }: { match: Match }) {
  const { home, away } = match;
  const data = match.momentum.map((p) => ({
    minute: p.minute,
    home: Math.max(p.net, 0),
    away: Math.min(p.net, 0),
    territory: p.territory,
  }));
  const recent = match.momentum.slice(-3);
  const inFlow = (['home', 'away'] as Side[]).filter(
    (s) => recent.length === 3 && recent.reduce((sum, p) => sum + p[s], 0) / 3 >= FLOW_THRESHOLD,
  );
  const chances = match.events.filter((e) => e.type === 'goal' || (e.type === 'shot' && (e.xg ?? 0) >= 0.12)).slice(-4).reverse();

  return (
    <section className="glass panel" aria-labelledby="momentum-title">
      <h2 id="momentum-title">Flow meter</h2>
      <p className="hint">Attacking threat minute by minute. Above the line favours {home.short}, below favours {away.short}.</p>
      {inFlow.length > 0 && (
        <div className="flow-badges">
          {inFlow.map((s) => (
            <span key={s} className="flow-badge" style={{ '--team': match[s].color } as CSSProperties}>⚡ {match[s].short} entered flow</span>
          ))}
        </div>
      )}
      <div className="chart" style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} stackOffset="sign" margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap={1}>
            <XAxis dataKey="minute" tick={axis} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis hide domain={[-100, 100]} />
            <ReferenceLine y={0} stroke="rgba(25,230,255,.45)" />
            <Tooltip cursor={{ fill: 'rgba(31,99,255,.12)' }} contentStyle={tooltipStyle} labelFormatter={(m) => `${m}'`} formatter={(v, name) => [Math.abs(Number(v)), name === 'home' ? home.short : away.short]} />
            <Bar dataKey="home" stackId="n" fill={home.color} isAnimationActive={false} />
            <Bar dataKey="away" stackId="n" fill={away.color} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3>Territory trend</h3>
      <div className="chart" style={{ height: 80 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <YAxis hide domain={[30, 70]} />
            <XAxis dataKey="minute" hide />
            <ReferenceLine y={50} stroke="rgba(255,255,255,.2)" strokeDasharray="3 3" />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => `${m}'`} formatter={(v) => [`${v}%`, `${home.short} possession`]} />
            <Area type="monotone" dataKey="territory" stroke={home.color} fill={home.color} fillOpacity={0.25} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <h3>Passing pressure</h3>
      <StatRow
        label="Pressing intensity"
        home={home.stats.pressing}
        away={away.stats.pressing}
        homeColor={home.color}
        awayColor={away.color}
        missing={match.missing?.includes('pressing')}
      />

      <h3>Recent chances</h3>
      {chances.length === 0 ? (
        <p className="hint">No big chances yet.</p>
      ) : (
        <ul className="chips">
          {chances.map((e) => (
            <li key={e.id} className="chip" style={{ borderColor: match[e.side].color }}>
              {e.minute}' {e.player} · {e.type === 'goal' ? 'goal' : `${(e.xg ?? 0).toFixed(2)} xG`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
