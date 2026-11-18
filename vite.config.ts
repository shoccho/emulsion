import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Canon's own style files in public/carriers are for local development only; never let them into a build. */
const dropCanonFiles: Plugin = {
  name: 'drop-canon-style-files',
  apply: 'build',
  closeBundle() {
    rmSync(resolve(import.meta.dirname, 'dist/carriers'), { recursive: true, force: true });
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), dropCanonFiles],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        probe: resolve(import.meta.dirname, 'spike.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
