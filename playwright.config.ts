import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  testMatch: '*.spec.ts',
  timeout: 30000,
  retries: 0,
  use: {
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    },
    headless: true,
  },
  webServer: {
    command: 'VITE_ENABLE_MOCK=1 npm run build && node scripts/serve-smoke.mjs',
    port: 4173,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
