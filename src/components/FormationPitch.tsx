import type { Match, Side } from '../types/match';

const W = 100;
const H = 64;

/** "4-3-3" -> [1, 4, 3, 3] (GK + lines). Null if it is not a valid 10-outfield formation. */
export function formationRows(formation: string): number[] | null {
  const parts = formation.split('-').map(Number);
  const valid = parts.length >= 3 && parts.every((n) => Number.isInteger(n) && n > 0) && parts.reduce((a, b) => a + b, 0) === 10;
  return valid ? [1, ...parts] : null;
}

function dots(rows: number[], side: Side) {
  return rows.flatMap((count, i) => {
    const t = i / (rows.length - 1);
    const x = side === 'home' ? 6 + t * 40 : W - (6 + t * 40);
    return Array.from({ length: count }, (_, j) => ({ x, y: ((j + 1) / (count + 1)) * H, key: `${side}-${i}-${j}` }));
  });
}

export function FormationPitch({ match }: { match: Match }) {
  const sides = (['home', 'away'] as Side[]).map((side) => ({ side, team: match[side], rows: formationRows(match[side].formation) }));
  return (
    <section className="glass panel" aria-labelledby="formation-title">
      <h2 id="formation-title">Formations</h2>
      {sides.every((s) => !s.rows) ? (
        <p className="hint">Lineups are not available from this data source.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="pitch" role="img" aria-label={`${match.home.formation} versus ${match.away.formation}`}>
          <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="2" className="pitch-line" />
          <line x1={W / 2} y1="0.5" x2={W / 2} y2={H - 0.5} className="pitch-line" />
          <circle cx={W / 2} cy={H / 2} r="7" className="pitch-line" />
          <rect x="0.5" y={H / 2 - 14} width="14" height="28" className="pitch-line" />
          <rect x={W - 14.5} y={H / 2 - 14} width="14" height="28" className="pitch-line" />
          {sides.map(({ side, team, rows }) =>
            rows ? dots(rows, side).map((d) => <circle key={d.key} cx={d.x} cy={d.y} r="2.3" fill={team.color} color={team.color} className="pitch-dot" />) : null,
          )}
        </svg>
      )}
      <div className="formation-legend">
        {sides.map(({ side, team }) => (
          <span key={side} style={{ color: team.color }}>{team.short} {team.formation || '—'}</span>
        ))}
      </div>
    </section>
  );
}
