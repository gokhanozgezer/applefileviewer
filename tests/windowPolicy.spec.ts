import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isSafeExternalUrl,
  isAllowedNavigation,
  isAllowedPermission,
  isThemeMode,
  MAC_FULL_DISK_ACCESS_URL,
} from '@main/windowPolicy';
import { PROD_CSP, DEV_CSP, cspForMeta } from '@shared/csp';

describe('isSafeExternalUrl', () => {
  it.each(['https://example.com', 'http://example.com/a?b=c', 'https://apple.com/support'])(
    '%s kabul',
    (u) => expect(isSafeExternalUrl(u)).toBe(true),
  );

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'backup://orig/x/y',
    'ms-settings:privacy',
    'smb://host/share',
    'data:text/html,<script>1</script>',
    'https://user:pass@evil.com',
    'not a url',
    '',
    'https://',
  ])('%s red', (u) => expect(isSafeExternalUrl(u)).toBe(false));

  it('macOS Tam Disk Erişimi paneli: yalnız darwin + birebir eşleşme', () => {
    expect(isSafeExternalUrl(MAC_FULL_DISK_ACCESS_URL, 'darwin')).toBe(true);
    expect(isSafeExternalUrl(MAC_FULL_DISK_ACCESS_URL, 'win32')).toBe(false);
    expect(isSafeExternalUrl(MAC_FULL_DISK_ACCESS_URL, 'linux')).toBe(false);
    for (const v of [
      'x-apple.systempreferences:com.apple.preference.security',
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
      MAC_FULL_DISK_ACCESS_URL + '&x',
      MAC_FULL_DISK_ACCESS_URL.toUpperCase(),
      ' ' + MAC_FULL_DISK_ACCESS_URL,
    ]) {
      expect(isSafeExternalUrl(v, 'darwin'), v).toBe(false);
    }
  });

  it('string olmayan / aşırı uzun girdi red', () => {
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl(42)).toBe(false);
    expect(isSafeExternalUrl('https://a.com/' + 'x'.repeat(3000))).toBe(false);
  });
});

describe('isAllowedNavigation', () => {
  const indexHtml = path.resolve('C:\\app\\dist\\index.html');
  const prod = { devUrl: null, indexHtml };
  const dev = { devUrl: 'http://localhost:5173/', indexHtml };

  it('prod: kendi index.html (hash ile) izinli', () => {
    const u = pathToFileURL(indexHtml).href;
    expect(isAllowedNavigation(u, prod)).toBe(true);
    expect(isAllowedNavigation(u + '#/backup/x', prod)).toBe(true);
  });

  it('prod: başka file:// ve http reddedilir', () => {
    expect(isAllowedNavigation(pathToFileURL(path.resolve('C:\\evil.html')).href, prod)).toBe(
      false,
    );
    expect(isAllowedNavigation('https://example.com', prod)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5173/', prod)).toBe(false);
  });

  it('dev: Vite origin izinli, başka port / host red', () => {
    expect(isAllowedNavigation('http://localhost:5173/photos', dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/', dev)).toBe(false);
    expect(isAllowedNavigation('http://evil.com:5173/', dev)).toBe(false);
  });

  it('bozuk URL red', () => {
    expect(isAllowedNavigation('::::', prod)).toBe(false);
  });
});

describe('isAllowedPermission', () => {
  it('yalnız pano yazma ve tam ekran', () => {
    expect(isAllowedPermission('clipboard-sanitized-write')).toBe(true);
    expect(isAllowedPermission('fullscreen')).toBe(true);
    for (const p of ['media', 'geolocation', 'notifications', 'clipboard-read', 'openExternal']) {
      expect(isAllowedPermission(p)).toBe(false);
    }
  });
});

describe('isThemeMode', () => {
  it('light/dark/system dışındakiler red', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('system')).toBe(true);
    for (const v of ['Light', '', null, undefined, 1, {}, ['dark']]) {
      expect(isThemeMode(v)).toBe(false);
    }
  });
});

describe('CSP', () => {
  it('prod: dış kaynak yok, unsafe-eval yok, sertleştirme direktifleri var', () => {
    expect(PROD_CSP).not.toMatch(/googleapis|gstatic|https?:/);
    expect(PROD_CSP).not.toContain('unsafe-eval');
    expect(PROD_CSP).toContain("script-src 'self'");
    expect(PROD_CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    for (const d of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ]) {
      expect(PROD_CSP).toContain(d);
    }
  });

  it('dev: Google yok, HMR için localhost izinli', () => {
    expect(DEV_CSP).not.toMatch(/googleapis|gstatic/);
    expect(DEV_CSP).toContain('ws://localhost:5173');
  });

  it("cspForMeta frame-ancestors (meta'da geçersiz) direktifini ayıklar", () => {
    const meta = cspForMeta(PROD_CSP);
    expect(meta).not.toContain('frame-ancestors');
    expect(meta).toContain("object-src 'none'");
    expect(meta).toContain("default-src 'self'");
  });
});
