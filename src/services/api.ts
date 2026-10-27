import type { DataMode, Match } from '../types/match';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

const postJson = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const getMatch = () => request<Match>('/api/match');

export const refreshMatch = () => request<Match>('/api/refresh', { method: 'POST' });

export const saveConfig = (config: { mode: Exclude<DataMode, 'screen'>; apiKey?: string }) => postJson<unknown>('/api/config', config);

/** Send one JPEG frame (base64, no data: prefix); resolves with a one-line description and whether football was visible. */
export const sendFrame = (image: string) => postJson<{ read: string; football: boolean }>('/api/screen/frame', { image });

export const getHealth = () => request<{ requestedMode: 'demo' | 'live'; hasKey: boolean }>('/api/health');

export const stopScreen = () => postJson<unknown>('/api/screen/stop', {});
