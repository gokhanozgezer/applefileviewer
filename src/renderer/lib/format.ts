// src/renderer/lib/format.ts
// Aktif dile göre sayı/boyut biçimlendirme — Intl + i18n birimleri.
// Dil değişimi RootLayout remount'u ile yansıdığından render sırasında çağrılır.
import { L } from '../i18n';
import { collator } from '../i18n/dateLocale';

/** 1234 → "1.234" (tr) / "1,234" (en). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat(collator()).format(n);
}

/** Bayt → okunur boyut: "512 B", "1,5 MB" (tr) / "1.5 MB" (en). 1024 tabanlı. */
export function formatBytes(bytes: number): string {
  const units = [L.units.byte, L.units.kb, L.units.mb, L.units.gb] as const;
  let value = Math.max(0, bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const nf = new Intl.NumberFormat(collator(), {
    maximumFractionDigits: i === 0 ? 0 : 1,
    minimumFractionDigits: i === 0 ? 0 : 1,
  });
  return `${nf.format(value)} ${units[i]}`;
}
