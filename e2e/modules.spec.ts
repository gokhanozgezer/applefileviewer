import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sentetik yedeği (globalSetup) açıp her modülü gezer. "Main yüklendi ama
// modüller boş/hatalı" sınıfı kırılmaları (ABI, IPC guard, CSP, protocol)
// yalnızca bu katman yakalar. Dil sabit: --lang=en-US + temiz userData.

let app: ElectronApplication;
let win: Page;
const pageErrors: string[] = [];

test.beforeAll(async () => {
  if (!process.env.AFV_BACKUP_DIR) throw new Error('AFV_BACKUP_DIR yok — globalSetup çalışmadı');
  app = await electron.launch({
    args: [path.resolve(__dirname, '..', 'dist-electron', 'main', 'index.js'), '--lang=en-US'],
    env: { ...process.env },
  });
  win = await app.firstWindow();
  win.on('pageerror', (e) => pageErrors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('sentetik yedek listelenir ve açılır', async () => {
  const card = win.getByRole('button', { name: /Test iPhone/ });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(win.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText('F2LXR0XXXX').first()).toBeVisible();
});

// Her modül için fixture'a özgü bir içerik işareti — sorgu gerçekten dönmeden
// "hata yok" demek yanıltıcı (anlık kontrol iskelet görünmeden geçiyordu).
const MODULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['Photos', /3 items/],
  ['Messages', /12025550101/],
  ['WhatsApp', /Family Group/],
  ['Calls', /4 calls/],
  ['Voicemail', /3 voicemails/],
  ['Notes', /Meeting notes/],
  ['Voice Memos', /3 recordings/],
  ['Contacts', /Emma Johnson/],
];

for (const [name, marker] of MODULES) {
  test(`modül: ${name} verisini hatasız yükler`, async () => {
    const nav = win.getByRole('navigation', { name: 'Modules' });
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(win.locator('main').getByText(marker).first()).toBeVisible({ timeout: 20_000 });
    await expect(win.getByRole('alert')).toHaveCount(0);
  });
}

test('yeniden yükleme: listeye döner, yedek yeniden açılır ve veri gelir', async () => {
  // Memory router → reload her zaman yedek listesine döner (tasarım gereği).
  // Renderer state'i sıfırlandıktan sonra main'in IPC guard'ı yedeği yeniden
  // kabul etmeli (tarama → kayıt → açma zinciri).
  await win.reload();
  const card = win.getByRole('button', { name: /Test iPhone/ });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await win
    .getByRole('navigation', { name: 'Modules' })
    .getByRole('link', { name: 'Contacts', exact: true })
    .click();
  await expect(
    win
      .locator('main')
      .getByText(/Emma Johnson/)
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(win.getByRole('alert')).toHaveCount(0);
});

test('global arama (Ctrl+K) sonuç döner', async () => {
  // ControlOrMeta: macOS'ta ⌘K, Windows/Linux'ta Ctrl+K (keymap platforma göre modifier seçer).
  await win.keyboard.press('ControlOrMeta+K');
  const input = win
    .getByRole('dialog')
    .getByRole('combobox')
    .or(win.getByRole('dialog').getByRole('textbox'));
  await input.first().fill('Emma');
  await expect(win.getByRole('dialog').getByText(/Emma/).first()).toBeVisible({ timeout: 15_000 });
  await win.keyboard.press('Escape');
});

test('konsolda yakalanmamış hata yok', () => {
  expect(pageErrors).toEqual([]);
});
