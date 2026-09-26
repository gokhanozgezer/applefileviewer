// Web sitesi / README ekran görüntüleri — yalnızca SENTETİK veri (screenshotsSetup.ts).
// EN arayüz (--lang=en-US), 1280x800, açık + koyu tema → site/assets/screenshots/<ad>-<tema>.png
// Çalıştırma: npm run screenshots (vite build + bu Playwright config'i).
import { test, expect, _electron as electron, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import sharp from 'sharp';

// Windows: sharp'ın dosya/işlem önbelleği ve toFile, var olan PNG'nin üzerine yazarken
// ara sıra "unable to open for write" veriyordu — önbelleği kapat, buffer'a üret, fs ile yaz.
sharp.cache(false);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'site', 'assets', 'screenshots');
const THEMES = ['light', 'dark'] as const;

async function setTheme(win: Page, mode: (typeof THEMES)[number]): Promise<void> {
  await win.evaluate(
    (m) =>
      (window as unknown as { api: { theme: { set(x: string): Promise<unknown> } } }).api.theme.set(
        m,
      ),
    mode,
  );
  // Renderer temayı mount'ta okur → yeniden yükle (memory router listeye döner).
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
}

async function shot(win: Page, name: string, theme: string): Promise<void> {
  // Geçiş animasyonları/placeholder'lar otursun; imleç hover efektini ekrandan çek.
  await win.mouse.move(1279, 799);
  await win.waitForTimeout(700);
  // Geçici test kökünün yolu (kullanıcı adı içerir) → tipik Windows yedek yolu.
  const tmpRoot = process.env.AFV_BACKUP_DIR ?? '';
  await win.evaluate((from) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (from && n.nodeValue?.includes(from)) {
        n.nodeValue = n.nodeValue
          .split(from)
          .join(String.raw`C:\Users\you\AppData\Roaming\Apple Computer\MobileSync\Backup`);
      }
    }
  }, tmpRoot);
  const raw = await win.screenshot({ animations: 'disabled' });
  // Boyut optimizasyonu: paletli PNG (site hızlı yüklensin; ~%60-75 küçülür).
  const png = await sharp(raw)
    .png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, `${name}-${theme}.png`), png);
}

async function imagesSettled(win: Page): Promise<void> {
  await win
    .waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('main img')) as HTMLImageElement[];
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
}

for (const theme of THEMES) {
  test(`screenshots (${theme})`, async () => {
    if (!process.env.AFV_BACKUP_DIR) throw new Error('AFV_BACKUP_DIR yok — setup çalışmadı');
    const app = await electron.launch({
      args: [path.join(ROOT, 'dist-electron', 'main', 'index.js'), '--lang=en-US'],
      env: Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
      ),
    });
    try {
      const win = await app.firstWindow();
      await win.waitForLoadState('domcontentloaded');
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w?.setContentSize(1280, 800);
      });
      await win.setViewportSize({ width: 1280, height: 800 }).catch(() => undefined);
      await setTheme(win, theme);

      // 1) Yedek listesi
      const card = win.getByRole('button', { name: /Test iPhone/ });
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(win.getByRole('button', { name: /Encrypted iPhone/ })).toBeVisible();
      await shot(win, 'backups', theme);

      // 2) Şifreli yedek → parola diyaloğu
      await win.getByRole('button', { name: /Encrypted iPhone/ }).click();
      const dialog = win.getByRole('dialog');
      await expect(dialog.getByLabel('Backup password')).toBeVisible();
      await shot(win, 'unlock', theme);
      await win.keyboard.press('Escape');
      await expect(win.getByRole('dialog')).toHaveCount(0);

      // 3) Genel bakış
      await card.click();
      const nav = win.getByRole('navigation', { name: 'Modules' });
      await expect(nav).toBeVisible({ timeout: 30_000 });
      await expect(win.getByText('F2LXR0XXXX').first()).toBeVisible();
      await shot(win, 'overview', theme);

      // 4) Fotoğraflar (albümlerle)
      await nav.getByRole('link', { name: 'Photos', exact: true }).click();
      await expect(
        win
          .locator('main')
          .getByText(/36 items/)
          .first(),
      ).toBeVisible({
        timeout: 30_000,
      });
      await imagesSettled(win);
      await shot(win, 'photos', theme);

      // 5) Mesaj konuşması
      await nav.getByRole('link', { name: 'Messages', exact: true }).click();
      const convo = win
        .locator('main')
        .getByText(/12025550101/)
        .first();
      await expect(convo).toBeVisible({ timeout: 30_000 });
      await convo.click();
      await win.waitForTimeout(800);
      await shot(win, 'messages', theme);

      // 6) Notlar
      await nav.getByRole('link', { name: 'Notes', exact: true }).click();
      const note = win
        .locator('main')
        .getByText(/Meeting notes/)
        .first();
      await expect(note).toBeVisible({ timeout: 30_000 });
      await note.click();
      await win.waitForTimeout(600);
      await shot(win, 'notes', theme);

      // 7) Global arama paleti (Ctrl+K)
      await win.keyboard.press('Control+K');
      const palette = win.getByRole('dialog');
      await expect(palette).toBeVisible();
      await win.keyboard.type('example');
      await win.waitForTimeout(1500);
      await shot(win, 'search', theme);
      await win.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });
}
