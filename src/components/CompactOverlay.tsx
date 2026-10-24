import { useScreenAnalysis } from '../hooks/useScreenAnalysis';
import type { Match } from '../types/match';
import { minuteLabel } from '../utils/format';
import { ModeBadge } from './ModeBadge';

interface Props {
  match: Match;
  showAI: boolean;
  /** Overlay window (?compact=1): draggable, closable, can scan the screen. Otherwise an in-page widget. */
  floating?: boolean;
  onExpand?: () => void;
}

function ScanBar() {
  const scan = useScreenAnalysis();
  const on = scan.status === 'scanning' || scan.status === 'starting';
  const status = scan.error ?? (on ? `${scan.frames} frames read · ${scan.lastRead ?? ''}` : 'Share the tab or window with the match. A vision model reads the scoreboard and play every 10 s.');
  return (
    <div className="scan">
      <button
        className={`btn btn-scan ${on ? 'on' : ''}`}
        onClick={on ? scan.stop : scan.start}
        title="Frames from the window you share are sent to the vision model's API (Claude or Gemini, set by SCREEN_MODEL) for analysis"
      >
        {on ? '■ Stop scanning' : '📡 Scan my screen'}
      </button>
      <span className={`scan-status ${scan.error ? 'error' : ''}`} role="status">{status}</span>
    </div>
  );
}

export function CompactOverlay({ match, showAI, floating, onExpand }: Props) {
  const { home, away } = match;
  const last = match.events.at(-1);
  const insight = match.insights[0];
  return (
    <aside className={`compact glass ${floating ? 'compact-floating' : ''}`} aria-label="Compact match overlay">
      <div className="cp-top">
        <ModeBadge match={match} />
        <span className="clock">
          {match.status === 'live' && <i className="pulse" aria-hidden />}
          {minuteLabel(match.minute, match.status)}
        </span>
        <span className="cp-btns">
          {onExpand && <button className="icon-btn" onClick={onExpand} aria-label="Expand to dashboard">⤢</button>}
          {floating && <button className="icon-btn" onClick={() => window.close()} aria-label="Close overlay">✕</button>}
        </span>
      </div>
      <div className="cp-score">
        <span style={{ color: home.color }}>{home.short}</span>
        <strong aria-label={`Score ${match.score.home} to ${match.score.away}`}>
          {match.score.home} – {match.score.away}
        </strong>
        <span style={{ color: away.color }}>{away.short}</span>
      </div>
      <div className="cp-poss" role="img" aria-label={`Possession ${home.stats.possession}% to ${away.stats.possession}%`}>
        <i style={{ width: `${home.stats.possession}%`, background: home.color }}>{home.stats.possession}%</i>
        <i style={{ width: `${away.stats.possession}%`, background: away.color }}>{away.stats.possession}%</i>
      </div>
      <div className="cp-stats">
        <span>xG {home.stats.xg.toFixed(2)} – {away.stats.xg.toFixed(2)}</span>
        <span>SOT {home.stats.shotsOnTarget} – {away.stats.shotsOnTarget}</span>
      </div>
      {last && <div className="cp-event">{last.minute}' {last.text}</div>}
      {showAI && insight && (
        <div className="cp-ai">
          <strong>{insight.title}.</strong> {insight.text}
        </div>
      )}
      {floating && <ScanBar />}
    </aside>
  );
}
