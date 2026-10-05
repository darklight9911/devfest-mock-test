import { defineConfig } from 'vitest/config';

// Relative base keeps the build portable: it works at a domain root (Vercel)
// and under a sub-path (GitHub Pages) without changes.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    // three.js is a separate, lazily loaded chunk (~150 kB gzipped) used only by the 3D view.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
