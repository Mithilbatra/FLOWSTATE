import { useCallback, useEffect, useState } from 'react';
import { getMatch, refreshMatch } from '../services/api';
import type { Match } from '../types/match';

export type LinkState = 'connecting' | 'live' | 'polling' | 'offline';

const POLL_MS = 5000;

/** WebSocket stream with exponential-backoff reconnect; falls back to polling while the socket is down. */
export function useMatchStream() {
  const [match, setMatch] = useState<Match | null>(null);
  const [link, setLink] = useState<LinkState>('connecting');

  useEffect(() => {
    let ws: WebSocket | undefined;
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        setMatch(await getMatch());
        // A poll that was already in flight when the socket reconnected must not relabel the link.
        if (ws?.readyState !== WebSocket.OPEN) setLink('polling');
      } catch {
        if (ws?.readyState !== WebSocket.OPEN) setLink('offline');
      }
    };

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/stream`);
      ws.onopen = () => {
        attempt = 0;
        clearInterval(pollTimer);
        pollTimer = undefined;
        setLink('live');
      };
      ws.onmessage = (e) => setMatch(JSON.parse(e.data));
      ws.onclose = () => {
        if (closed) return;
        if (!pollTimer) {
          void poll();
          pollTimer = setInterval(poll, POLL_MS);
        }
        retryTimer = setTimeout(connect, Math.min(10_000, 1000 * 2 ** attempt++));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(pollTimer);
      ws?.close();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setMatch(await refreshMatch());
    } catch {
      setLink('offline');
    }
  }, []);

  return { match, link, refresh };
}
