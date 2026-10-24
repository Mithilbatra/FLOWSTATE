import type { Match, Side } from '../types/match';

const ZONES = ['left', 'center', 'right'] as const;

export function AttackZones({ match }: { match: Match }) {
  return (
    <section className="glass panel" aria-labelledby="zones-title">
      <h2 id="zones-title">Attack lanes</h2>
      {match.missing?.includes('attackZones') ? (
        <p className="hint">Attack lanes can't be measured from this source.</p>
      ) : (
        (['home', 'away'] as Side[]).map((side) => {
          const team = match[side];
          const max = Math.max(...ZONES.map((z) => team.stats.attackZones[z]), 1);
          return (
            <div key={side} className="zones-team">
              <div className="zones-name" style={{ color: team.color }}>{team.name}</div>
              <div className="zones">
                {ZONES.map((z) => {
                  const v = team.stats.attackZones[z];
                  return (
                    <div key={z} className="zone" style={{ background: `color-mix(in srgb, ${team.color} ${Math.round((v / max) * 70)}%, transparent)` }}>
                      <strong>{v}%</strong>
                      <span>{z}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
