import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// package.json "type": "module" → spec ESM olarak koşar; __dirname yok.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Uygulama açılış smoke'u — ABI "tüm modüller boş" sınıfı hataların
// tek yakalanabildiği katman: main + preload + renderer birlikte ayağa kalkar.
// Önkoşul: dist/ (vite build) + dist-electron/ + Electron ABI'li better-sqlite3
// (npm run test:e2e zinciri bunları hazırlar).

test('uygulama açılır, yedek listesi ekranı gelir', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '..', 'dist-electron', 'main', 'index.js')],
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  await expect(win).toHaveTitle(/AppleFileViewer/i);

  // Renderer gerçekten mount oldu mu — sidebar uygulama adı görünür olmalı.
  await expect(win.locator('body')).toContainText(/AppleFileViewer|Yedek/i, {
    timeout: 15_000,
  });

  // Konsolda uncaught error yakala (ABI sınıfı sessiz kırılmalar genelde burada görünür)
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForTimeout(1500);
  expect(errors).toEqual([]);

  await app.close();
});
