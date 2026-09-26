// windowPolicy — pencere sertleştirme kararlarının saf (Electron'suz) yüzü.
// index.ts'teki setWindowOpenHandler / will-navigate / izin handler'ları ve THEME_SET
// doğrulaması buradaki fonksiyonları çağırır; böylece birim testle doğrulanabilir.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ThemeMode } from '@shared/ipc';

/**
 * macOS Sistem Ayarları → Gizlilik ve Güvenlik → Tam Disk Erişimi paneli. Yedek klasörü
 * (~/Library/Application Support/MobileSync) TCC korumalı; kullanıcıyı izne yönlendirir.
 */
export const MAC_FULL_DISK_ACCESS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

/**
 * http/https dışındaki TEK istisnalar — birebir (exact-match) karşılaştırılır; önek/sorgu
 * varyasyonu kabul edilmez (keyfi x-apple.* / özel şema açılmasın).
 */
const ALLOWED_SYSTEM_URLS: Readonly<Partial<Record<NodeJS.Platform, ReadonlySet<string>>>> = {
  darwin: new Set([MAC_FULL_DISK_ACCESS_URL]),
};

/**
 * Sistem tarayıcısında (ya da OS'ta) açılmasına izin verilen harici URL: http/https +
 * platforma özgü birebir istisnalar (macOS'ta Tam Disk Erişimi paneli).
 */
export function isSafeExternalUrl(
  raw: unknown,
  platform: NodeJS.Platform = process.platform,
): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  if (ALLOWED_SYSTEM_URLS[platform]?.has(raw)) return true;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  // Kimlik bilgisi gömülü URL (http://user:pass@host) — oltalama deseni, reddet
  if (u.username || u.password) return false;
  return u.hostname.length > 0;
}

/**
 * Güncelleme akışının açabileceği tek hedef: https://github.com/... (releases sayfası /
 * release asset indirmesi). Alt alan adı, http, port ve kimlik bilgisi reddedilir.
 */
export function isGitHubUrl(raw: unknown): raw is string {
  if (!isSafeExternalUrl(raw)) return false;
  const u = new URL(raw);
  return u.protocol === 'https:' && u.hostname === 'github.com' && u.port === '';
}

export interface NavigationContext {
  /** Dev'de Vite sunucu adresi (VITE_DEV_SERVER_URL); prod'da null. */
  devUrl: string | null;
  /** Prod'da yüklenen index.html'in mutlak yolu. */
  indexHtml: string;
}

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/**
 * Pencerenin gidebileceği tek yer uygulamanın kendi sayfası: dev'de Vite origin'i,
 * prod'da dist/index.html (hash/query serbest — router hash kullanabilir).
 */
export function isAllowedNavigation(raw: string, ctx: NavigationContext): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (ctx.devUrl) {
    try {
      if (u.origin === new URL(ctx.devUrl).origin) return true;
    } catch {
      /* bozuk dev URL — aşağı düş */
    }
  }
  if (u.protocol === 'file:') {
    try {
      return samePath(fileURLToPath(u), ctx.indexHtml);
    } catch {
      return false;
    }
  }
  return false;
}

// Renderer'ın gerçekten kullandığı izinler: navigator.clipboard.writeText + Lightbox
// requestFullscreen. Geri kalan her şey (media, geolocation, notifications...) red.
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-sanitized-write',
  'fullscreen',
]);

export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}
