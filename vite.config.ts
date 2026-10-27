/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Same PORT as the backend, which reads .env; a shell PORT still wins.
  const backend = `http://127.0.0.1:${loadEnv(mode, process.cwd(), '').PORT || 3737}`;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': backend,
        '/stream': { target: backend, ws: true },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
    },
  };
});
