import { useCallback, useState } from 'react';

declare global {
  interface Window {
    /** Document Picture-in-Picture (Chrome and Edge 116+): a window that stays above all others, rendered by this page. */
    documentPictureInPicture?: { requestWindow(options?: { width?: number; height?: number }): Promise<Window>; window: Window | null };
  }
}

const WIDTH = 400;
const HEIGHT = 440;

const openPopup = () => window.open('/?compact=1', 'flowstate-overlay', `popup,width=${WIDTH},height=${HEIGHT}`);

/**
 * Opens the overlay in a window that floats above every other window, the video included. The page renders into
 * it (see App), so it shares this page's match feed. Browsers without Document Picture-in-Picture get a normal pop-up.
 */
export function useFloatingWindow() {
  const [win, setWin] = useState<Window | null>(null);

  const open = useCallback(async () => {
    const pip = window.documentPictureInPicture;
    if (!pip) return void openPopup();
    if (pip.window) return; // already floating; opening another would close it and end its scan
    let w: Window;
    try {
      w = await pip.requestWindow({ width: WIDTH, height: HEIGHT });
    } catch {
      return void openPopup();
    }
    // It opens empty at about:blank: copy this page's styles in, with links made absolute.
    for (const el of document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]')) {
      const copy = el.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
      if (copy instanceof HTMLLinkElement) copy.href = (el as HTMLLinkElement).href;
      w.document.head.append(copy);
    }
    w.document.title = 'FLOWSTATE';
    w.document.documentElement.classList.add('overlay');
    w.addEventListener('pagehide', () => setWin(null));
    setWin(w);
  }, []);

  return { win, open };
}
