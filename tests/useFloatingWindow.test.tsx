import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFloatingWindow } from '../src/hooks/useFloatingWindow';

afterEach(() => {
  delete window.documentPictureInPicture;
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

/** A second window to stand in for the Picture-in-Picture one. */
function secondWindow() {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame.contentWindow!;
}

describe('useFloatingWindow', () => {
  it("opens an always-on-top window with the page's styles, and forgets it once closed", async () => {
    const pip = secondWindow();
    const requestWindow = vi.fn(async () => pip);
    window.documentPictureInPicture = { requestWindow, window: null };
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/assets/app.css' });
    document.head.append(link, Object.assign(document.createElement('style'), { textContent: '.compact { width: 360px; }' }));
    const { result } = renderHook(() => useFloatingWindow());
    await act(() => result.current.open());
    expect(requestWindow).toHaveBeenCalledWith({ width: 400, height: 440 });
    expect(result.current.win).toBe(pip);
    expect(pip.document.documentElement.classList.contains('overlay')).toBe(true);
    expect(pip.document.head.querySelector('link')!.getAttribute('href')).toBe(`${location.origin}/assets/app.css`);
    expect(pip.document.head.querySelector('style')!.textContent).toBe('.compact { width: 360px; }');
    act(() => void pip.dispatchEvent(new (pip as unknown as typeof globalThis).Event('pagehide'))); // the user closes it
    expect(result.current.win).toBeNull();
  });

  it('does not replace a floating window that is already open (that would end its scan)', async () => {
    const requestWindow = vi.fn();
    window.documentPictureInPicture = { requestWindow, window: secondWindow() };
    const { result } = renderHook(() => useFloatingWindow());
    await act(() => result.current.open());
    expect(requestWindow).not.toHaveBeenCalled();
  });

  it('falls back to a pop-up where the browser has no Document Picture-in-Picture', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => useFloatingWindow());
    await act(() => result.current.open());
    expect(open).toHaveBeenCalledWith('/?compact=1', 'flowstate-overlay', 'popup,width=400,height=440');
    expect(result.current.win).toBeNull();
  });
});
