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

/** Send one JPEG frame (base64, no data: prefix) for scan `scanId`; resolves with a one-line description and whether football was visible. */
export const sendFrame = (image: string, scanId: string) => postJson<{ read: string; football: boolean }>('/api/screen/frame', { image, scanId });

export const getHealth = () => request<{ requestedMode: 'demo' | 'live'; hasKey: boolean }>('/api/health');

/** The stop URL for a scan; also used as a beacon when the overlay window closes. */
export const stopUrl = (scanId?: string) => `/api/screen/stop${scanId ? `?scan=${encodeURIComponent(scanId)}` : ''}`;

export const stopScreen = (scanId?: string) => postJson<unknown>(stopUrl(scanId), {});

/** The scan's window is still open, though its picture is unchanged (a paused video). */
export const keepAlive = (scanId: string) => postJson<unknown>(`/api/screen/alive?scan=${encodeURIComponent(scanId)}`, {});
