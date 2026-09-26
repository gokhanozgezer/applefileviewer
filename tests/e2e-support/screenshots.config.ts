import { defineConfig } from '@playwright/test';

// Web sitesi/README ekran görüntüleri — SENTETİK veriyle (bkz. screenshotsSetup.ts).
// Çalıştırma: npm run screenshots → site/assets/screenshots/*.png
export default defineConfig({
  testDir: '.',
  testMatch: 'screenshots.ts',
  globalSetup: './screenshotsSetup.ts',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
});
