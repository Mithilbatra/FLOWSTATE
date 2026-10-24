import { AttackZones } from '../components/AttackZones';
import { FormationPitch } from '../components/FormationPitch';
import { InsightPanel } from '../components/InsightPanel';
import { TeamComparison } from '../components/TeamComparison';
import type { Match } from '../types/match';

export function Tactical({ match, showAI }: { match: Match; showAI: boolean }) {
  return (
    <div className="grid grid-2">
      <div className="col">
        <TeamComparison match={match} />
        <AttackZones match={match} />
      </div>
      <div className="col">
        <FormationPitch match={match} />
        {showAI && <InsightPanel match={match} />}
      </div>
    </div>
  );
}
