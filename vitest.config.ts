import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // .worktrees: isolated git worktrees (feature work) — never run/duplicate
    // their tests when invoked from the main checkout.
    exclude: ['**/node_modules/**', '.next', 'e2e/**', '.worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'vitest.shim-server-only.ts'),
    },
  },
});
