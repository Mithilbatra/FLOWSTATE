// Thin desktop shell: shows the compact overlay in a frameless, transparent, always-on-top window.
// Start the app first (npm run dev), or use `npm run dev:overlay` to start everything together.
const { app, BrowserWindow, desktopCapturer, dialog, screen, session } = require('electron');

const URL = process.env.OVERLAY_URL || 'http://localhost:5173/?compact=1';
let win;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
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
  // "Scan my screen": on macOS 15+ the system picker opens and this handler is skipped. Elsewhere, ask which
  // window to share instead of silently sending the whole screen; callback(null) denies the request.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = (await desktopCapturer.getSources({ types: ['window', 'screen'] })).slice(0, 10);
        // Parented to the overlay so it is not hidden behind an always-on-top window.
        const { response } = await dialog.showMessageBox(win, {
          message: 'Which window shows the match?',
          buttons: [...sources.map((s) => s.name), 'Cancel'],
          cancelId: sources.length,
        });
        callback(sources[response] ? { video: sources[response] } : null);
      } catch {
        callback(null); // e.g. no screen-recording permission: deny rather than leave the overlay waiting forever
      }
    },
    { useSystemPicker: true },
  );
  createWindow();
});
app.on('window-all-closed', () => app.quit());
