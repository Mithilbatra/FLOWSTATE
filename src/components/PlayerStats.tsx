import type { Match, PlayerStat } from '../types/match';
import { impact, topPlayers } from '../utils/players';

interface HighlightProps {
  weapon: string;
  meaning: string;
  player?: PlayerStat;
  metric: string;
  match: Match;
}

function Highlight({ weapon, meaning, player, metric, match }: HighlightProps) {
  return (
    <article className="glass highlight">
      <div className="hl-label">Weapon // {weapon}</div>
      <div className="hl-sub">{meaning}</div>
      {player ? (
        <>
          <div className="hl-name" style={{ borderLeftColor: match[player.side].color }}>{player.name}</div>
          <div className="hl-metric">{metric}</div>
        </>
      ) : (
        <div className="hl-name">—</div>
      )}
    </article>
  );
}

export function PlayerStats({ match }: { match: Match }) {
  const active = match.players.filter((p) => p.touches > 0);
  if (active.length === 0) {
    return (
      <section className="glass panel">
        <h2>Ego rankings</h2>
        <p className="hint">This data source does not supply player-level stats. Switch to demo mode to see the full player view.</p>
      </section>
    );
  }
  const top = topPlayers(active);
  const ranked = active.slice().sort((a, b) => impact(b) - impact(a)).slice(0, 8);
  const max = impact(ranked[0]) || 1;

  return (
    <>
      <div className="highlights">
        <Highlight match={match} weapon="Metavision" meaning="Top passer" player={top.passer} metric={top.passer ? `${top.passer.passes} passes · ${top.passer.passAccuracy}%` : ''} />
        <Highlight match={match} weapon="Dribble" meaning="Top dribbler" player={top.dribbler} metric={top.dribbler ? `${top.dribbler.dribbles} dribbles won` : ''} />
        <Highlight match={match} weapon="The wall" meaning="Key defender" player={top.defender} metric={top.defender ? `${top.defender.tackles} tackles · ${top.defender.interceptions} int.` : ''} />
        <Highlight match={match} weapon="Ego king" meaning="Most involved" player={top.involved} metric={top.involved ? `${top.involved.touches} touches` : ''} />
      </div>
      <section className="glass panel" aria-labelledby="impact-title">
        <h2 id="impact-title">Ego rankings</h2>
        <div className="table-wrap">
          <table className="impact">
            <thead>
              <tr><th>Rank</th><th>Player</th><th>Touches</th><th>Passes</th><th>Drib.</th><th>Tkl</th><th>Shots</th><th>Impact</th></tr>
            </thead>
            <tbody>
              {ranked.map((p, i) => (
                <tr key={`${p.side}-${p.name}`}>
                  <td className="rank">#{i + 1}</td>
                  <td><i className="mh-dot" style={{ background: match[p.side].color, color: match[p.side].color }} aria-hidden /> {p.name}</td>
                  <td>{p.touches}</td><td>{p.passes}</td><td>{p.dribbles}</td><td>{p.tackles + p.interceptions}</td><td>{p.shots}</td>
                  <td><div className="impact-bar"><i style={{ width: `${(impact(p) / max) * 100}%`, background: match[p.side].color }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
