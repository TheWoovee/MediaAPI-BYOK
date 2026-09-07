import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/studio/',
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname!, 'shared') },
  },
  plugins: [
    react(),
    cloudflare({ persistState: true }),
  ],
});
