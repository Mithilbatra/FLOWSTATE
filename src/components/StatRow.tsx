import { share } from '../utils/format';

interface Props {
  label: string;
  home: number;
  away: number;
  homeColor: string;
  awayColor: string;
  format?: (n: number) => string;
  /** The source cannot measure this stat: show "—" instead of a misleading 0 */
  missing?: boolean;
}

/** One head-to-head comparison row: value | split bar | value. */
export function StatRow({ label, home, away, homeColor, awayColor, format = String, missing }: Props) {
  if (missing) {
    return (
      <div className="stat-row stat-missing">
        <div className="stat-label">{label}</div>
        <div className="stat-line" role="img" aria-label={`${label}: not available from this source`}>
          <span className="stat-val">—</span>
          <div className="stat-bar" />
          <span className="stat-val">—</span>
        </div>
      </div>
    );
  }
  const h = share(home, away);
  return (
    <div className="stat-row">
      <div className="stat-label">{label}</div>
      <div className="stat-line">
        <span className="stat-val">{format(home)}</span>
        <div className="stat-bar" role="img" aria-label={`${label}: ${format(home)} to ${format(away)}`}>
          <i style={{ width: `${h}%`, background: homeColor, color: homeColor }} />
          <i style={{ width: `${100 - h}%`, background: awayColor, color: awayColor }} />
        </div>
        <span className="stat-val">{format(away)}</span>
      </div>
    </div>
  );
}
