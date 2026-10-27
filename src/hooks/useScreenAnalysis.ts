import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, sendFrame, stopScreen } from '../services/api';

interface ScanState {
  status: 'idle' | 'starting' | 'scanning' | 'error';
  frames: number;
  lastRead?: string;
  error?: string;
}

const INTERVAL_MS = 10_000;
const MAX_WIDTH = 1280;
/** Mean per-channel pixel change (0-255) below which a frame counts as unchanged (paused video). */
const MIN_CHANGE = 3;
/**
 * Frames in a row with no football before a forgotten scan stops itself: about 2 minutes if no match was ever seen,
 * about 20 minutes once one was (half-time studio shows and ad breaks are not football but must not end the scan).
 */
const MAX_EMPTY_FRAMES = { neverSeen: 12, afterMatch: 120 };

function thumbnailDiff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return sum / ((a.length / 4) * 3);
}

/**
 * Shares a window/tab/screen with getDisplayMedia and sends a downscaled JPEG to the backend every
 * 10 s for the vision model to read. Unchanged frames (paused video) are skipped so they cost nothing.
 */
export function useScreenAnalysis() {
  const [state, setState] = useState<ScanState>({ status: 'idle', frames: 0 });
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  const stop = useCallback((error?: string) => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
    setState((s) => ({ ...s, status: error ? 'error' : 'idle', error }));
    void stopScreen().catch(() => {});
  }, []);

  const start = useCallback(async () => {
    setState({ status: 'starting', frames: 0 });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
    } catch {
      setState({ status: 'error', frames: 0, error: 'Screen sharing was cancelled or is blocked.' });
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play().catch(() => {});

    const frame = document.createElement('canvas');
    const thumb = document.createElement('canvas');
    thumb.width = 32;
    thumb.height = 18;
    let previous: Uint8ClampedArray | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    let emptyFrames = 0;
    let seenFootball = false;
    // Closing the overlay window kills the capture; tell the server now rather than leaving the last reading up.
    const onLeave = () => navigator.sendBeacon('/api/screen/stop');
    window.addEventListener('pagehide', onLeave);

    cleanupRef.current = () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('pagehide', onLeave);
      stream.getTracks().forEach((t) => t.stop());
    };
    // The browser's own "Stop sharing" button ends the track.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stop());

    const tick = async () => {
      if (!alive) return;
      const started = Date.now();
      if (video.videoWidth) {
        const t = thumb.getContext('2d', { willReadFrequently: true })!;
        t.drawImage(video, 0, 0, thumb.width, thumb.height);
        const pixels = t.getImageData(0, 0, thumb.width, thumb.height).data;
        const changed = !previous || thumbnailDiff(previous, pixels) >= MIN_CHANGE;
        previous = pixels;
        if (changed) {
          const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
          frame.width = Math.round(video.videoWidth * scale);
          frame.height = Math.round(video.videoHeight * scale);
          frame.getContext('2d')!.drawImage(video, 0, 0, frame.width, frame.height);
          const image = frame.toDataURL('image/jpeg', 0.8).split(',')[1];
          try {
            const { read, football } = await sendFrame(image);
            if (!alive) return; // stopped while this frame was in flight
            seenFootball ||= football;
            emptyFrames = football ? 0 : emptyFrames + 1;
            if (emptyFrames >= MAX_EMPTY_FRAMES[seenFootball ? 'afterMatch' : 'neverSeen']) {
              return stop(`No football match seen for about ${seenFootball ? 20 : 2} minutes, so scanning stopped to save your quota.`);
            }
            setState((s) => ({ ...s, status: 'scanning', frames: s.frames + 1, lastRead: read, error: undefined }));
          } catch (err) {
            if (!alive) return;
            // A missing or rejected key will not fix itself: stop instead of retrying forever.
            if (err instanceof ApiError && err.status === 503) return stop(err.message);
            setState((s) => ({ ...s, error: (err as Error).message }));
          }
        }
      }
      // A steady 10 s rhythm: the time spent reading the frame counts toward the wait.
      if (alive) timer = setTimeout(tick, Math.max(0, INTERVAL_MS - (Date.now() - started)));
    };
    setState({ status: 'scanning', frames: 0, lastRead: 'Reading the first frame…' });
    void tick();
  }, [stop]);

  useEffect(() => () => cleanupRef.current?.(), []);

  return { ...state, start, stop: () => stop() };
}
