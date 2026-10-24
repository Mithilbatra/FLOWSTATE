import type { Match } from '../types/match';

export function InsightPanel({ match }: { match: Match }) {
  const source = match.mode === 'screen' ? 'Vision model + rule engine' : 'Rule-based analyst';
  return (
    <section className="glass panel insight" aria-labelledby="ai-title">
      <div className="panel-head">
        <h2 id="ai-title">Ego analyst</h2>
        <span className="badge badge-ai" title="Insights come from deterministic rules over the live stats; in screen mode the first card is what the vision model saw on your screen">
          {source}
        </span>
      </div>
      <p className="summary">{match.summary}</p>
      <div className="insight-list">
        {match.insights.map((i) => (
          <article key={i.id} className={`insight-card tone-${i.tone}`} style={i.side ? { borderLeftColor: match[i.side].color } : undefined}>
            <h3>{i.title}</h3>
            <p>{i.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
