import { useCallback, useState } from 'react';

const KEY = 'flowstate.settings';

export type View = 'overview' | 'tactical' | 'players';

export interface Settings {
  view: View;
  compact: boolean;
  showAI: boolean;
  onboarded: boolean;
}

const defaults: Settings = { view: 'overview', compact: false, showAI: true, onboarded: false };

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

/** UI preferences persisted per browser; storage failures (private mode) just mean no persistence. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
