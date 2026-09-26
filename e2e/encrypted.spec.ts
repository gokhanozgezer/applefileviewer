import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptSessionDirs, pathExists } from '../tests/e2e-support/sessionDirs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Şifreli yedek uçtan uca: globalSetup ikinci, ŞİFRELİ bir yedek üretir
// (tests/e2e-support/buildBackup.ts — "Encrypted iPhone", küçük PBKDF2 turu).
// Kart kilitli → yanlış parola hatası → doğru parola ile modüller fixture verisini
// gösterir → Kilitle → listeye dönüş, rozet yeniden kilitli, afv-dec-* oturum dizini silinmiş.
const ENC_PASSWORD = 'e2e-parola-Ş1'; // buildBackup.ts E2E_ENC_PASSWORD
const ENC_NAME = /Encrypted iPhone/;

let app: ElectronApplication;
let win: Page;
let mainPid = 0;
let closed = false;

/** Main sürecin os.tmpdir() altındaki afv-dec-<pid>-* oturum dizinleri. */
function sessionDirs(): string[] {
  return decryptSessionDirs(mainPid);
}

test.beforeAll(async () => {
  if (!process.env.AFV_BACKUP_DIR) throw new Error('AFV_BACKUP_DIR yok — globalSetup çalışmadı');
  app = await electron.launch({
    args: [path.resolve(__dirname, '..', 'dist-electron', 'main', 'index.js'), '--lang=en-US'],
    env: { ...process.env },
  });
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  mainPid = await app.evaluate(() => process.pid);
});

test.afterAll(async () => {
  if (!closed) await app?.close();
});

test('şifreli yedek kilitli görünür; yanlış parola satır içi hata verir', async () => {
  const card = win.getByRole('button', { name: ENC_NAME });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByTestId('backup-lock-badge')).toHaveAttribute('data-locked', 'true');
  await expect(card).toContainText('LOCKED');

  await card.click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const input = dialog.getByLabel('Backup password');
  await expect(input).toBeFocused();
  await expect(dialog).toContainText('never saved');

  await input.fill('yanlis-parola');
  await input.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Wrong password', { timeout: 20_000 });
  await expect(input).toBeFocused();
  expect(sessionDirs()).toEqual([]);
});

test('doğru parola → yedek açılır, Mesajlar ve Kişiler fixture verisini gösterir', async () => {
  const dialog = win.getByRole('dialog');
  const input = dialog.getByLabel('Backup password');
  await input.fill(ENC_PASSWORD);
  await input.press('Enter');

  const nav = win.getByRole('navigation', { name: 'Modules' });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  expect(sessionDirs()).toHaveLength(1);

  await nav.getByRole('link', { name: 'Messages', exact: true }).click();
  await expect(
    win
      .locator('main')
      .getByText(/12025550101/)
      .first(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await nav.getByRole('link', { name: 'Contacts', exact: true }).click();
  await expect(
    win
      .locator('main')
      .getByText(/Emma Johnson/)
      .first(),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(win.locator('main').getByRole('alert')).toHaveCount(0);
});

test('Kilitle → listeye döner, bildirim, rozet yeniden kilitli, oturum dizini silinmiş', async () => {
  const dirs = sessionDirs();
  expect(dirs).toHaveLength(1);

  await win.getByRole('button', { name: 'Lock backup' }).click();
  const card = win.getByRole('button', { name: ENC_NAME });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText(/Backup locked/)).toBeVisible();
  await expect(card.getByTestId('backup-lock-badge')).toHaveAttribute('data-locked', 'true');

  await expect.poll(() => pathExists(dirs[0]!), { timeout: 10_000 }).toBe(false);
  expect(sessionDirs()).toEqual([]);

  // Kilitli yedek yeniden parola ister
  await card.click();
  await expect(win.getByRole('dialog').getByLabel('Backup password')).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByRole('dialog')).toHaveCount(0);
});

test('çıkışta (before-quit) kilidi açık oturumun düz metni silinir', async () => {
  await win.getByRole('button', { name: ENC_NAME }).click();
  const input = win.getByRole('dialog').getByLabel('Backup password');
  await input.fill(ENC_PASSWORD);
  await input.press('Enter');
  await expect(win.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 30_000 });
  const dirs = sessionDirs();
  expect(dirs).toHaveLength(1);

  closed = true;
  await app.close();
  expect(pathExists(dirs[0]!)).toBe(false);
});
