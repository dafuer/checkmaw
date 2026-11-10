import { defineConfig } from 'vitest/config';

// GitHub Pages serves the game from https://dafuer.github.io/checkmaw/, so the
// production build needs that base path; the dev server stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/checkmaw/' : '/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
