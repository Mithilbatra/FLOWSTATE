import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Match, Side } from '../types/match';

const BURST_MS = 2600;

/** Full-screen anime-style GOAL slash whenever a side's score goes up (not on first load or a new match). */
export function GoalBurst({ match }: { match: Match }) {
  const previous = useRef<{ id: string; home: number; away: number } | null>(null);
  const [burst, setBurst] = useState<{ side: Side; at: number } | null>(null);

  useEffect(() => {
    const p = previous.current;
    previous.current = { id: match.id, ...match.score };
    if (!p || p.id !== match.id) return;
    const side: Side | null = match.score.home > p.home ? 'home' : match.score.away > p.away ? 'away' : null;
    if (side) setBurst({ side, at: Date.now() });
  }, [match]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), BURST_MS);
    return () => clearTimeout(t);
  }, [burst]);

  if (!burst) return null;
  const team = match[burst.side];
  const scorer = match.events.findLast((e) => e.type === 'goal' && e.side === burst.side)?.player;
  return (
    <div key={burst.at} className="goal-burst" style={{ '--team': team.color } as CSSProperties} role="status" aria-live="assertive">
      <div className="gb-lines" aria-hidden />
      <div className="gb-band">
        <span className="gb-word">Goal</span>
        <span className="gb-team">{team.name}{scorer ? ` · ${scorer}` : ''}</span>
      </div>
    </div>
  );
}
