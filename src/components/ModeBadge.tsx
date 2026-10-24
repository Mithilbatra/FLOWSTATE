import type { DataMode, Match } from '../types/match';

const LABEL: Record<DataMode, [string, string]> = {
  demo: ['Demo mode', 'Simulated match data, not a real fixture'],
  live: ['Live data', 'Real fixture from football-data.org'],
  screen: ['Screen scan', 'Read from your screen by a vision model: score and clock as shown, other stats estimated'],
};

export function ModeBadge({ match }: { match: Match }) {
  const [label, title] = LABEL[match.mode];
  return (
    <span className="badges">
      <span className={`badge badge-${match.mode}`} title={title}>{label}</span>
      {match.estimated && (
        <span className="badge badge-est" title="Some stats are derived estimates; this source does not supply them directly">
          Estimated stats
        </span>
      )}
    </span>
  );
}
