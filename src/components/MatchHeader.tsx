import type { CSSProperties } from 'react';
import type { Match, Team } from '../types/match';
import { minuteLabel } from '../utils/format';
import { ModeBadge } from './ModeBadge';

function TeamBlock({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <div className={`mh-team mh-${align}`}>
      <span className="mh-dot" style={{ background: team.color, color: team.color }} aria-hidden />
      <div>
        <div className="mh-name">{team.name}</div>
        {team.formation && <div className="mh-sub">{team.formation}</div>}
      </div>
    </div>
  );
}

export function MatchHeader({ match }: { match: Match }) {
  const live = match.status === 'live';
  return (
    <header className="glass match-header" style={{ '--home': match.home.color, '--away': match.away.color } as CSSProperties}>
      <div className="mh-top">
        <span className="mh-comp">{match.competition}</span>
        <ModeBadge match={match} />
        <span className="clock" aria-label="Match clock">
          {live && <i className="pulse" aria-hidden />}
          {minuteLabel(match.minute, match.status)}
        </span>
      </div>
      <div className="mh-teams">
        <TeamBlock team={match.home} align="right" />
        <div className="score" aria-label={`Score ${match.score.home} to ${match.score.away}`}>
          <span className="digit">{match.score.home}</span>
          <i className="slash" aria-hidden />
          <span className="digit">{match.score.away}</span>
        </div>
        <TeamBlock team={match.away} align="left" />
      </div>
    </header>
  );
}
