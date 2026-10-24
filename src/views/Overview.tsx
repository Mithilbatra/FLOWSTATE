import { EventTimeline } from '../components/EventTimeline';
import { InsightPanel } from '../components/InsightPanel';
import { MomentumPanel } from '../components/MomentumPanel';
import { StatsPanel } from '../components/StatsPanel';
import type { Match } from '../types/match';

export function Overview({ match, showAI }: { match: Match; showAI: boolean }) {
  return (
    <div className="grid grid-2">
      <div className="col">
        <StatsPanel match={match} />
        <MomentumPanel match={match} />
      </div>
      <div className="col">
        {showAI && <InsightPanel match={match} />}
        <EventTimeline match={match} />
      </div>
    </div>
  );
}
