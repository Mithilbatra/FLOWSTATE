// Runs the backend and the Vite dev server together (plus the Electron overlay with --overlay).
import { spawn } from 'node:child_process';

const jobs = [
  ['server', ['run', 'server']],
  ['web', ['exec', 'vite']],
];
if (process.argv.includes('--overlay')) jobs.push(['overlay', ['run', 'overlay']]);

const children = jobs.map(([name, args]) => {
  // npm is npm.cmd on Windows, which only spawns through a shell.
  const child = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} exited (${code})`);
    // Closing the overlay window is normal; only a server or web exit stops everything.
    if (name !== 'overlay') stop();
  });
  return child;
});

function stop() {
  children.forEach((c) => c.kill());
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
