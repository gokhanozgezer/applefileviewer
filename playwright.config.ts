import { defineConfig } from '@playwright/test';

// Electron E2E — tarayıcı indirme GEREKMEZ (playwright'ın _electron sürücüsü
// projedeki electron binary'sini kullanır). Çalıştırma: npm run test:e2e
// (önce Electron ABI + vite build; script zincirine bakın).
export default defineConfig({
  testDir: './e2e',
  globalSetup: './tests/e2e-support/globalSetup.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1, // tek Electron instance
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
