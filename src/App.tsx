import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CompactOverlay } from './components/CompactOverlay';
import { Controls } from './components/Controls';
import { GoalBurst } from './components/GoalBurst';
import { MatchHeader } from './components/MatchHeader';
import { Onboarding } from './components/Onboarding';
import { PlayerStats } from './components/PlayerStats';
import { useFloatingWindow } from './hooks/useFloatingWindow';
import { useMatchStream } from './hooks/useMatchStream';
import { useSettings } from './hooks/useSettings';
import { Overview } from './views/Overview';
import { Tactical } from './views/Tactical';

// ?compact=1 is the overlay as its own page (the pop-up fallback, or Electron).
const OVERLAY = new URLSearchParams(location.search).has('compact');

export default function App() {
  const { match, link, refresh } = useMatchStream();
  const [settings, update] = useSettings();
  const floating = useFloatingWindow();

  useEffect(() => {
    document.documentElement.classList.toggle('overlay', OVERLAY);
  }, []);

  if (!OVERLAY && !settings.onboarded) {
    return <Onboarding onDone={({ compact }) => update({ onboarded: true, compact })} />;
  }

  if (!match) {
    return (
      <main className="splash" role="status">
        {link === 'offline' ? 'Backend not reachable. Start it with npm run dev. Retrying…' : 'Entering the field…'}
      </main>
    );
  }

  // The floating window (Document Picture-in-Picture) is drawn by this page, from this page's match feed.
  const floatingOverlay =
    floating.win &&
    createPortal(
      <>
        <CompactOverlay match={match} showAI={settings.showAI} floating />
        <GoalBurst match={match} />
      </>,
      floating.win.document.body,
    );

  if (OVERLAY) {
    return (
      <>
        <CompactOverlay match={match} showAI={settings.showAI} floating />
        <GoalBurst match={match} />
      </>
    );
  }

  if (settings.compact) {
    return (
      <main className="compact-stage">
        <CompactOverlay match={match} showAI={settings.showAI} onExpand={() => update({ compact: false })} />
        <GoalBurst match={match} />
        {floatingOverlay}
      </main>
    );
  }

  return (
    <div className="app">
      <Controls settings={settings} update={update} link={link} onRefresh={refresh} onScanScreen={floating.open} />
      <MatchHeader match={match} />
      {match.notice && <div className="notice" role="alert">{match.notice}</div>}
      <main>
        {settings.view === 'overview' && <Overview match={match} showAI={settings.showAI} />}
        {settings.view === 'tactical' && <Tactical match={match} showAI={settings.showAI} />}
        {settings.view === 'players' && <PlayerStats match={match} />}
      </main>
      <GoalBurst match={match} />
      {floatingOverlay}
    </div>
  );
}
