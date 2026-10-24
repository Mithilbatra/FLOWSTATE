export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with a timeout and exponential backoff. 4xx (except 429) are not retried. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  { retries = 3, baseDelayMs = 400, timeoutMs = 8000 }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return (await res.json()) as T;
      const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      if (res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
      lastError = err;
    } catch (err) {
      if ((err as { fatal?: boolean }).fatal) throw err;
      lastError = err;
    }
    if (attempt < retries - 1) await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}
