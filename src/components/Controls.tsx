import { useState } from 'react';
import type { LinkState } from '../hooks/useMatchStream';
import type { Settings, View } from '../hooks/useSettings';

const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'overview', label: 'Match', title: 'Stats, flow meter, analyst and match log' },
  { id: 'tactical', label: 'Metavision', title: 'Tactics: head to head, formations, attack lanes' },
  { id: 'players', label: 'Rankings', title: 'Player weapons and ego rankings' },
];

const LINK_LABEL: Record<LinkState, string> = {
  connecting: 'Connecting…',
  live: 'Live stream',
  polling: 'Polling (stream down)',
  offline: 'Backend offline — retrying',
};

const openOverlay = () => window.open('/?compact=1', 'flowstate-overlay', 'popup,width=400,height=440');

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  link: LinkState;
  onRefresh: () => Promise<void>;
}

export function Controls({ settings, update, link, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    await onRefresh();
    setBusy(false);
  };

  return (
    <nav className="controls glass" aria-label="Dashboard controls">
      <div className="brand">
        <img className="logo" src="/flowstate.svg" alt="" /> Flowstate <em>Ego mode</em>
      </div>
      <div className="tabs" role="tablist" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={settings.view === v.id} className="tab" title={v.title} onClick={() => update({ view: v.id })}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="control-actions">
        <span className={`link link-${link}`} role="status">
          <i aria-hidden /> {LINK_LABEL[link]}
        </span>
        <button className="btn btn-scan" onClick={openOverlay} title="Open the floating overlay; from there it can scan the match you are watching">
          📡 Scan my screen
        </button>
        <button className="btn" aria-pressed={settings.showAI} onClick={() => update({ showAI: !settings.showAI })}>
          Analyst {settings.showAI ? 'on' : 'off'}
        </button>
        <button className="btn" onClick={() => update({ compact: true })}>Compact</button>
        <button className="btn" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn" onClick={() => update({ onboarded: false })} aria-label="Data source settings">Settings</button>
      </div>
    </nav>
  );
}
