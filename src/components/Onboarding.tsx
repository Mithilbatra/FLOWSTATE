import { useState, type FormEvent } from 'react';
import { saveConfig } from '../services/api';
import type { DataMode } from '../types/match';

interface Props {
  onDone: (opts: { compact: boolean }) => void;
}

export function Onboarding({ onDone }: Props) {
  const [mode, setMode] = useState<Exclude<DataMode, 'screen'>>('demo');
  const [apiKey, setApiKey] = useState('');
  const [compact, setCompact] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveConfig({ mode, ...(mode === 'live' && { apiKey: apiKey.trim() }) });
      onDone({ compact });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding">
      <form className="glass onboarding-card" onSubmit={submit}>
        <div className="brand"><img className="logo" src="/flowstate.svg" alt="" /> Flowstate <em>Ego mode</em></div>
        <h1>Awaken your <span>ego.</span></h1>
        <p className="hint">
          Read the game like a striker: live xG, flow, tactics and a sharp analyst, in a floating overlay or a full dashboard.
          Watching on YouTube or anywhere else? Hit <strong>Scan my screen</strong> in the overlay and a vision model (Claude or Gemini) reads the match for you.
        </p>

        <fieldset>
          <legend>Data source</legend>
          <label className={`choice ${mode === 'demo' ? 'selected' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'demo'} onChange={() => setMode('demo')} />
            <span><strong>Demo match</strong><small>Simulated live game. No key needed, always works.</small></span>
          </label>
          <label className={`choice ${mode === 'live' ? 'selected' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'live'} onChange={() => setMode('live')} />
            <span><strong>Live fixtures</strong><small>football-data.org. Free tier gives scores; possession, shots and xG are estimated and labelled.</small></span>
          </label>
        </fieldset>

        {mode === 'live' && (
          <label className="field">
            API key
            <input type="password" required autoComplete="off" spellCheck={false} placeholder="football-data.org token" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <small>Kept in the local server's memory only. If it fails, the app falls back to demo data.</small>
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Start in compact overlay mode
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Entering…' : 'Enter the field'}</button>
      </form>
    </main>
  );
}
