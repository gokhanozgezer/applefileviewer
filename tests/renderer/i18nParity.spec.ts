import { describe, it, expect } from 'vitest';
import { tr } from '@renderer/i18n/tr';
import { en } from '@renderer/i18n/en';

/** Sözlüğü "a.b.c" yaprak anahtar listesine düzleştirir. */
function leafKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

function valueAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
}

describe('i18n tr/en parity', () => {
  it('iki sözlük birebir aynı anahtar kümesine sahip', () => {
    const trKeys = leafKeys(tr);
    const enKeys = new Set(leafKeys(en));
    const trSet = new Set(trKeys);
    const missingInEn = trKeys.filter((k) => !enKeys.has(k));
    const missingInTr = [...enKeys].filter((k) => !trSet.has(k));
    expect({ missingInEn, missingInTr }).toEqual({ missingInEn: [], missingInTr: [] });
  });

  // Prefix/Suffix parçaları dile göre bilinçli olarak boş olabilir (ör. TR: '"x" için sonuç yok').
  it('boş çeviri yok (Prefix/Suffix parçaları hariç)', () => {
    const empty = (d: unknown) =>
      leafKeys(d).filter((p) => {
        const v = valueAt(d, p);
        if (/(Prefix|Suffix)$/.test(p)) return false;
        return typeof v === 'string' && v.trim() === '';
      });
    expect(empty(tr)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});
