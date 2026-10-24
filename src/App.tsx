import { useEffect } from 'react';
import { CompactOverlay } from './components/CompactOverlay';
import { Controls } from './components/Controls';
import { GoalBurst } from './components/GoalBurst';
import { MatchHeader } from './components/MatchHeader';
import { Onboarding } from './components/Onboarding';
import { useMatchStream } from './hooks/useMatchStream';
import { useSettings } from './hooks/useSettings';
import { Overview } from './views/Overview';
import { Players } from './views/Players';
import { Tactical } from './views/Tactical';

// ?compact=1 is the floating overlay window (browser pop-out or Electron).
const OVERLAY = new URLSearchParams(location.search).has('compact');

export default function App() {
  const { match, link, refresh } = useMatchStream();
  const [settings, update] = useSettings();

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
      </main>
    );
  }

  return (
    <div className="app">
      <Controls settings={settings} update={update} link={link} onRefresh={refresh} />
      <MatchHeader match={match} />
      {match.notice && <div className="notice" role="alert">{match.notice}</div>}
      <main>
        {settings.view === 'overview' && <Overview match={match} showAI={settings.showAI} />}
        {settings.view === 'tactical' && <Tactical match={match} showAI={settings.showAI} />}
        {settings.view === 'players' && <Players match={match} />}
      </main>
      <GoalBurst match={match} />
    </div>
  );
}
