// src/renderer/i18n/dateLocale.ts
// Aktif dile göre date-fns locale'i + Intl/localeCompare için BCP-47 etiketi.
// Bileşenler date-fns/locale'den doğrudan `tr` import ETMEZ — dil İngilizce
// seçildiğinde tarihler Türkçe kalıyordu. Dil değişimi RootLayout remount'u ile
// yansıdığından fonksiyonlar render sırasında çağrılabilir.
import type { Locale as DateFnsLocale } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';
import { getActiveLocale } from './index';

/** `format(d, 'd MMM', { locale: dateLocale() })` */
export function dateLocale(): DateFnsLocale {
  return getActiveLocale() === 'tr' ? tr : enUS;
}

/** `a.localeCompare(b, collator())` / `Intl.NumberFormat(collator())` için BCP-47 etiketi. */
export function collator(): string {
  return getActiveLocale() === 'tr' ? 'tr-TR' : 'en-US';
}
