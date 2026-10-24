import { useState } from 'react';
import type { EventType, Match } from '../types/match';

const ICON: Record<EventType, string> = {
  goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔁', foul: '✋', shot: '🎯', corner: '🚩', offside: '🏳️',
};
const KEY_EVENTS: EventType[] = ['goal', 'yellow', 'red', 'sub'];

export function EventTimeline({ match }: { match: Match }) {
  const [keyOnly, setKeyOnly] = useState(true);
  const events = match.events
    .filter((e) => !keyOnly || KEY_EVENTS.includes(e.type))
    .slice()
    .reverse()
    .slice(0, 40);

  return (
    <section className="glass panel" aria-labelledby="timeline-title">
      <div className="panel-head">
        <h2 id="timeline-title">Match log</h2>
        <button className="btn btn-sm" aria-pressed={keyOnly} onClick={() => setKeyOnly(!keyOnly)}>
          {keyOnly ? 'Key events' : 'All events'}
        </button>
      </div>
      {events.length === 0 ? (
        <p className="hint">Nothing to report yet.</p>
      ) : (
        <ul className="timeline">
          {events.map((e) => (
            <li key={e.id} className={`tl-item tl-${e.type}`} style={{ borderLeftColor: match[e.side].color }}>
              <span className="tl-min">{e.minute}'</span>
              <span className="tl-icon" aria-hidden>{ICON[e.type]}</span>
              <span className="tl-text">
                {e.text}
                <small> · {match[e.side].short}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
