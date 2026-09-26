import { describe, it, expect, vi } from 'vitest';
import {
  EXPORT_CSP,
  EXPORT_CSP_META,
  PDF_PARTITION,
  pdfWebPreferences,
  isAllowedPdfRequest,
  pdfDocUrl,
  pdfDocIdFromUrl,
  withTimeout,
} from '@main/modules/export/pdfPolicy';

describe('pdfPolicy', () => {
  it('webPreferences: JS kapalı, sandbox, izolasyon, node yok, ayrı partition', () => {
    const wp = pdfWebPreferences();
    expect(wp.javascript).toBe(false);
    expect(wp.sandbox).toBe(true);
    expect(wp.contextIsolation).toBe(true);
    expect(wp.nodeIntegration).toBe(false);
    expect(wp.webSecurity).toBe(true);
    expect(wp.partition).toBe(PDF_PARTITION);
    // Bellek-içi session — persist: öneki diske yazardı
    expect(PDF_PARTITION.startsWith('persist:')).toBe(false);
  });

  it('CSP: script/ağ yasak, yalnız inline stil + data: görsel', () => {
    expect(EXPORT_CSP).toContain("default-src 'none'");
    expect(EXPORT_CSP).toContain("style-src 'unsafe-inline'");
    expect(EXPORT_CSP).not.toMatch(/script-src/);
    expect(EXPORT_CSP).not.toMatch(/https?:/);
    expect(EXPORT_CSP_META).toContain('http-equiv="Content-Security-Policy"');
  });

  it('istek filtresi: yalnız belge şeması ve data:', () => {
    expect(isAllowedPdfRequest(pdfDocUrl('abc'))).toBe(true);
    expect(isAllowedPdfRequest('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedPdfRequest('https://example.com/x.png')).toBe(false);
    expect(isAllowedPdfRequest('http://127.0.0.1:8080/')).toBe(false);
    expect(isAllowedPdfRequest('file:///C:/Windows/win.ini')).toBe(false);
    expect(isAllowedPdfRequest('backup://orig/udid/file')).toBe(false);
    expect(isAllowedPdfRequest('ws://evil')).toBe(false);
  });

  it('pdfDocUrl ↔ pdfDocIdFromUrl gidiş-dönüş', () => {
    expect(pdfDocIdFromUrl(pdfDocUrl('1234-abcd'))).toBe('1234-abcd');
    expect(pdfDocIdFromUrl(`${pdfDocUrl('x')}?q=1`)).toBe('x');
    expect(pdfDocIdFromUrl('https://doc/x')).toBeNull();
    expect(pdfDocIdFromUrl(pdfDocUrl(''))).toBeNull();
  });

  it('withTimeout: süre dolunca hata, önce biterse değer', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<number>(() => undefined);
      const p = withTimeout(never, 1000, 'PDF');
      const assertion = expect(p).rejects.toThrow(/PDF: zaman aşımı/);
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
    await expect(withTimeout(Promise.resolve(7), 1000, 'x')).resolves.toBe(7);
  });
});
