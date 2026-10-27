import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real ApiError; replace the network calls.
const api = vi.hoisted(() => ({ sendFrame: vi.fn(), stopScreen: vi.fn(() => Promise.resolve({})) }));
vi.mock('../src/services/api', async (original) => ({ ...(await original<object>()), ...api }));

const { ApiError } = await import('../src/services/api');
const { useScreenAnalysis } = await import('../src/hooks/useScreenAnalysis');

// jsdom has no screen capture, video decoding or canvas: fake just enough. `pixels` is the 32x18 thumbnail.
let pixels = new Uint8ClampedArray(32 * 18 * 4);
const track = { stop: vi.fn(), addEventListener: vi.fn() };
const stream = { getTracks: () => [track], getVideoTracks: () => [track] };

beforeEach(() => {
  vi.useFakeTimers();
  pixels = new Uint8ClampedArray(32 * 18 * 4);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: vi.fn(async () => stream) } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  api.sendFrame.mockReset();
  api.stopScreen.mockClear();
  track.stop.mockClear();
});

const nextFrame = () => act(() => vi.advanceTimersByTimeAsync(10_000));
const changePicture = (value: number) => (pixels = new Uint8ClampedArray(32 * 18 * 4).fill(value));

describe('useScreenAnalysis', () => {
  it('sends changed frames and skips unchanged ones (paused video)', async () => {
    api.sendFrame.mockResolvedValue({ read: 'MCI 1–0 ARS', football: true });
    const { result } = renderHook(() => useScreenAnalysis());
    await act(() => result.current.start());
    expect(api.sendFrame).toHaveBeenCalledTimes(1);
    await nextFrame(); // same picture
    expect(api.sendFrame).toHaveBeenCalledTimes(1);
    changePicture(200);
    await nextFrame();
    expect(api.sendFrame).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('scanning');
    expect(result.current.frames).toBe(2);
  });

  it('stops for good when the key is missing (503)', async () => {
    api.sendFrame.mockRejectedValue(new ApiError('No Gemini key. Set GEMINI_API_KEY in .env and restart the server.', 503));
    const { result } = renderHook(() => useScreenAnalysis());
    await act(() => result.current.start());
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/No Gemini key/);
    expect(track.stop).toHaveBeenCalled();
    expect(api.stopScreen).toHaveBeenCalled();
  });

  it('stops itself after 12 frames in a row with no football (audit #6)', async () => {
    api.sendFrame.mockResolvedValue({ read: 'No football match in this frame', football: false });
    const { result } = renderHook(() => useScreenAnalysis());
    await act(() => result.current.start());
    for (let i = 1; i < 12; i++) {
      changePicture(i * 10);
      await nextFrame();
    }
    expect(api.sendFrame).toHaveBeenCalledTimes(12);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/No football match seen/);
    expect(track.stop).toHaveBeenCalled();
  });

  it('keeps scanning through a half-time break once a match was seen', async () => {
    api.sendFrame.mockResolvedValueOnce({ read: 'MCI 1–0 ARS', football: true }).mockResolvedValue({ read: 'Studio', football: false });
    const { result } = renderHook(() => useScreenAnalysis());
    await act(() => result.current.start());
    for (let i = 1; i <= 15; i++) {
      changePicture(i * 10);
      await nextFrame();
    }
    expect(api.sendFrame).toHaveBeenCalledTimes(16);
    expect(result.current.status).toBe('scanning');
  });

  it('tells the server when the overlay window is closed', async () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    api.sendFrame.mockResolvedValue({ read: 'MCI 1–0 ARS', football: true });
    const { result } = renderHook(() => useScreenAnalysis());
    await act(() => result.current.start());
    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledWith('/api/screen/stop');
  });

  it('stays stopped when a frame answers after Stop was pressed', async () => {
    let answer!: (v: { read: string; football: boolean }) => void;
    api.sendFrame.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useScreenAnalysis());
    await act(() => result.current.start());
    act(() => result.current.stop());
    await act(async () => answer({ read: 'MCI 1–0 ARS', football: true }));
    expect(result.current.status).toBe('idle');
  });
});
