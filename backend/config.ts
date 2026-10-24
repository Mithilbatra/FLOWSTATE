import type { DataMode } from '../src/types/match';

export interface Config {
  port: number;
  mode: DataMode;
  apiKey: string;
  matchId: string;
  simSpeed: number;
  simSeed: number;
  simStartMinute: number;
  screenModel: string;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: num(env.PORT, 3737),
    mode: env.DATA_MODE === 'live' ? 'live' : 'demo',
    apiKey: env.FOOTBALL_DATA_API_KEY ?? '',
    matchId: env.FOOTBALL_DATA_MATCH_ID ?? '',
    simSpeed: Math.max(0.1, num(env.SIM_SPEED, 1)),
    simSeed: num(env.SIM_SEED, 42),
    simStartMinute: Math.max(0, Math.min(89, num(env.SIM_START_MINUTE, 24))),
    screenModel: env.SCREEN_MODEL || 'claude-opus-5-5',
  };
}
