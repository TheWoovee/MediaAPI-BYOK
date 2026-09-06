import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname!, 'shared') },
  },
  test: {
    include: ['worker/**/*.test.ts', 'src/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
  },
});
