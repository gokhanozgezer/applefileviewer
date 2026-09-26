// src/renderer/i18n/index.ts
// Runtime locale katmanı — tr.ts anahtar yapısının type source'udur (I18n),
// aktif sözlük burada seçilir. Tüketiciler SADECE buradan import eder:
//   import { L } from '<relative>/i18n';
// `L.section.key` okumaları Proxy üzerinden her zaman aktif dile gider;
// dil değişimi App.tsx'te `key={locale}` remount'u ile ekrana yansır.
import { tr } from './tr';
import { en } from './en';

export type Locale = 'tr' | 'en';

/** Literal string tiplerini `string`e genişletir — en.ts tr ile aynı YAPIYI
 *  taşımak zorunda kalır ama birebir aynı metinleri değil. */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };
export type I18n = Widen<typeof tr>;

const STORAGE_KEY = 'afv.locale';

const dicts: Record<Locale, I18n> = { tr, en };

function isLocale(v: unknown): v is Locale {
  return v === 'tr' || v === 'en';
}

/** Kullanıcı tercihi (localStorage) → yoksa sistem dili (tr* → tr, aksi en). */
export function detectLocale(): Locale {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLocale(stored)) return stored;
  } catch {
    // localStorage erişilemez (ör. test ortamı) — sistem diline düş.
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return lang?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

let activeLocale: Locale = detectLocale();
let active: I18n = dicts[activeLocale];
syncDocumentLang(activeLocale);

/** <html lang> aktif dille senkron — CSS `uppercase` dile duyarlı (tr: i → İ). */
function syncDocumentLang(l: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/** Aktif sözlüğe delege eden sabit referans — mevcut `L.section.key`
 *  erişim deseni için top-level get yeterli. */
export const L: I18n = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (active as unknown as Record<string | symbol, unknown>)[prop],
  has: (_target, prop) => prop in (active as unknown as Record<string | symbol, unknown>),
  ownKeys: () => Reflect.ownKeys(active),
  getOwnPropertyDescriptor: (_target, prop) =>
    Reflect.getOwnPropertyDescriptor(active as unknown as object, prop),
}) as I18n;

export function setActiveLocale(l: Locale): void {
  activeLocale = l;
  active = dicts[l];
  syncDocumentLang(l);
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // Persist edilemedi — oturum içi geçiş yine de çalışır.
  }
}

export function getActiveLocale(): Locale {
  return activeLocale;
}
