import { PlayerStats } from '../components/PlayerStats';
import type { Match } from '../types/match';

export function Players({ match }: { match: Match }) {
  return <PlayerStats match={match} />;
}
