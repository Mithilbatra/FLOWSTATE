// Thin desktop shell: shows the compact overlay in a frameless, transparent, always-on-top window.
// Start the app first (npm run dev), or use `npm run dev:overlay` to start everything together.
const { app, BrowserWindow, desktopCapturer, screen, session } = require('electron');

const URL = process.env.OVERLAY_URL || 'http://localhost:5173/?compact=1';

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: 380,
    height: 420,
    x: workArea.x + workArea.width - 400,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // 'screen-saver' level keeps it above full-screen video players on macOS.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const origin = new globalThis.URL(URL).origin;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, target) => {
    if (new globalThis.URL(target).origin !== origin) e.preventDefault();
  });

  // The dev server may still be starting; keep retrying until it answers.
  const load = () => win.loadURL(URL).catch(() => {});
  win.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame) setTimeout(load, 1000);
  });
  load();
}

app.whenReady().then(() => {
  // "Scan screen": on macOS 15+ the system picker lets you choose the window with the match.
  // Where no system picker exists, the primary screen is shared.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => callback({ video: sources[0] }));
    },
    { useSystemPicker: true },
  );
  createWindow();
});
app.on('window-all-closed', () => app.quit());
