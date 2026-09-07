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
    cloudflare({
      persistState: true,
      // Workers AI has no local emulation. Remote bindings need a Cloudflare login/token; default them on only
      // when credentials are present so `vite dev`/`vite preview` work offline (AI calls then fail at runtime).
      remoteBindings: process.env.CF_REMOTE_BINDINGS === '1' || Boolean(process.env.CLOUDFLARE_API_TOKEN),
    }),
  ],
});
