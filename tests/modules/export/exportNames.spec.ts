import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  uniqueFileName,
  validateBatchItems,
  isBatchItem,
  MAX_NAME_LENGTH,
  MAX_BATCH_ITEMS,
} from '@main/modules/export/exportNames';

describe('sanitizeName', () => {
  it('Windows yasak karakterleri ve kontrol karakterleri → _', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(sanitizeName('ad\u0000\u001fsoyad')).toBe('ad_soyad');
  });

  it('boşlukları tekilleştirir ve kırpar', () => {
    expect(sanitizeName('  Ali   Veli \n ')).toBe('Ali Veli');
  });

  it('"." ve ".." dizin geçişi → fallback', () => {
    expect(sanitizeName('.')).toBe('export');
    expect(sanitizeName('..')).toBe('export');
    expect(sanitizeName('...')).toBe('export');
    expect(sanitizeName(' .. ', 'x')).toBe('x');
  });

  it('boş / string olmayan → fallback', () => {
    expect(sanitizeName('')).toBe('export');
    expect(sanitizeName('   ')).toBe('export');
    expect(sanitizeName(undefined)).toBe('export');
    expect(sanitizeName(42, 'fb')).toBe('fb');
  });

  it('yol ayırıcı içeren ad tek dosya adına iner (dizin kaçışı yok)', () => {
    const out = sanitizeName('../../Windows/system32');
    expect(out).not.toContain('/');
    expect(out).not.toContain('\\');
    expect(out).not.toBe('..');
  });

  it('sondaki nokta/boşluk atılır', () => {
    expect(sanitizeName('rapor. . ')).toBe('rapor');
    expect(sanitizeName('dosya...')).toBe('dosya');
  });

  it('Windows ayrılmış adları (uzantılı/küçük harf dahil) önek alır', () => {
    for (const r of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9']) {
      expect(sanitizeName(r)).toBe(`_${r}`);
    }
    expect(sanitizeName('nul.txt')).toBe('_nul.txt');
    expect(sanitizeName('CON.tar.gz')).toBe('_CON.tar.gz');
    // Ayrılmış adı İÇEREN normal adlar etkilenmez
    expect(sanitizeName('CONSOLE')).toBe('CONSOLE');
    expect(sanitizeName('icon.png')).toBe('icon.png');
    expect(sanitizeName('COM10')).toBe('COM10');
  });

  it('uzun ad MAX_NAME_LENGTH’e kırpılır, uzantı korunur', () => {
    const long = `${'a'.repeat(300)}.jpeg`;
    const out = sanitizeName(long);
    expect(out.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(out.endsWith('.jpeg')).toBe(true);
    const noExt = sanitizeName('b'.repeat(500));
    expect(noExt).toHaveLength(MAX_NAME_LENGTH);
  });

  it('kırpma sonrası sondaki nokta/boşluk yine atılır', () => {
    const name = `${'a'.repeat(MAX_NAME_LENGTH - 2)} .x${'y'.repeat(40)}`;
    const out = sanitizeName(name);
    expect(out.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(out).not.toMatch(/[. ]$/);
  });

  it('Türkçe/Unicode adlar korunur', () => {
    expect(sanitizeName('Gökhan Özgezer — Sohbet')).toBe('Gökhan Özgezer — Sohbet');
  });
});

describe('uniqueFileName', () => {
  it('çakışma yoksa ad aynen; seen güncellenir', () => {
    const seen = new Set<string>();
    expect(uniqueFileName('a.jpg', seen, () => false)).toBe('a.jpg');
    expect(seen.has('a.jpg')).toBe(true);
  });

  it('aynı istekte tekrar → " (2)", " (3)" (büyük/küçük harf duyarsız)', () => {
    const seen = new Set<string>();
    uniqueFileName('a.jpg', seen, () => false);
    expect(uniqueFileName('A.JPG', seen, () => false)).toBe('A (2).JPG');
    expect(uniqueFileName('a.jpg', seen, () => false)).toBe('a (3).jpg');
  });

  it('hedefte var olan dosya atlanır', () => {
    const existing = new Set(['not.txt', 'not (2).txt']);
    expect(uniqueFileName('not.txt', new Set(), (n) => existing.has(n))).toBe('not (3).txt');
  });

  it('uzantısız ad', () => {
    const seen = new Set(['readme']);
    expect(uniqueFileName('README', seen, () => false)).toBe('README (2)');
  });
});

describe('validateBatchItems / isBatchItem', () => {
  it('dizi olmayan → hata mesajı (throw değil)', () => {
    expect(validateBatchItems(undefined)).toMatch(/dizi/);
    expect(validateBatchItems({ length: 1 })).toMatch(/dizi/);
    expect(validateBatchItems('abc')).toMatch(/dizi/);
  });

  it('boş dizi → hata', () => {
    expect(validateBatchItems([])).not.toBeNull();
  });

  it('sınır aşımı → hata; sınırda → geçerli', () => {
    expect(validateBatchItems(new Array(MAX_BATCH_ITEMS + 1).fill(null))).toMatch(/fazla/);
    expect(validateBatchItems(new Array(MAX_BATCH_ITEMS).fill(null))).toBeNull();
  });

  it('isBatchItem şekil kontrolü', () => {
    expect(isBatchItem({ fileId: 'a', suggestedName: 'b' })).toBe(true);
    expect(isBatchItem({ fileId: 1, suggestedName: 'b' })).toBe(false);
    expect(isBatchItem({ fileId: 'a' })).toBe(false);
    expect(isBatchItem(null)).toBe(false);
    expect(isBatchItem('x')).toBe(false);
  });
});
