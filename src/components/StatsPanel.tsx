import type { Match, TeamStats } from '../types/match';
import { StatRow } from './StatRow';

const pct = (n: number) => `${Math.round(n)}%`;
const xg = (n: number) => n.toFixed(2);

const ROWS: { label: string; key: keyof TeamStats; get: (s: TeamStats) => number; format?: (n: number) => string }[] = [
  { label: 'Possession', key: 'possession', get: (s) => s.possession, format: pct },
  { label: 'Shots', key: 'shots', get: (s) => s.shots },
  { label: 'Shots on target', key: 'shotsOnTarget', get: (s) => s.shotsOnTarget },
  { label: 'Expected goals (xG)', key: 'xg', get: (s) => s.xg, format: xg },
  { label: 'Pass accuracy', key: 'passAccuracy', get: (s) => s.passAccuracy, format: pct },
  { label: 'Fouls', key: 'fouls', get: (s) => s.fouls },
  { label: 'Corners', key: 'corners', get: (s) => s.corners },
  { label: 'Offsides', key: 'offsides', get: (s) => s.offsides },
  { label: 'Cards', key: 'yellowCards', get: (s) => s.yellowCards + s.redCards },
];

export function StatsPanel({ match }: { match: Match }) {
  const { home, away } = match;
  return (
    <section className="glass panel" aria-labelledby="stats-title">
      <h2 id="stats-title">Match data</h2>
      <div className="stat-teams">
        <span style={{ color: home.color }}>{home.short}</span>
        <span style={{ color: away.color }}>{away.short}</span>
      </div>
      {ROWS.map((r) => (
        <StatRow
          key={r.label}
          label={r.label}
          home={r.get(home.stats)}
          away={r.get(away.stats)}
          homeColor={home.color}
          awayColor={away.color}
          format={r.format}
          missing={match.missing?.includes(r.key)}
        />
      ))}
    </section>
  );
}
