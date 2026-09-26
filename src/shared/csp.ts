// csp — Content-Security-Policy tek kaynağı.
// Hem main (session header enjeksiyonu) hem vite.config (prod build'de <meta> enjeksiyonu)
// buradan okur; iki yol aynı politikayı taşısın diye ayrı tanımlanmaz.
// Prod'da uygulama file:// ile yüklenir — webRequest.onHeadersReceived file:// için
// tetiklenmeyebilir, bu yüzden <meta> yolu asıl güvencedir, header yolu ek katmandır.
// Not: frame-ancestors <meta> içinde desteklenmez (tarayıcı uyarı basar) — meta'ya
// yazılırken cspForMeta ile ayıklanır; header yolunda geçerlidir.

const DEV_ORIGIN = 'http://localhost:5173';
const DEV_WS = 'ws://localhost:5173';

// Dış kaynak YOK: yazı tipleri @fontsource paketlerinden yerel olarak bundle'lanır.
const COMMON = [
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React inline style prop'ları için unsafe-inline gerekli (script değil, stil)
  "style-src 'self' 'unsafe-inline'",
  // Vite küçük woff2 alt kümelerini data: URI olarak inline edebilir
  "font-src 'self' data:",
  "img-src 'self' data: backup:",
  "media-src 'self' backup:",
  "connect-src 'self'",
  ...COMMON,
].join('; ');

// Dev: Vite HMR için unsafe-eval + unsafe-inline (react-refresh preamble) ve ws gerekli
export const DEV_CSP = [
  `default-src 'self' ${DEV_ORIGIN} ${DEV_WS}`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${DEV_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: backup:",
  "media-src 'self' backup:",
  `connect-src 'self' ${DEV_WS} ${DEV_ORIGIN}`,
  ...COMMON,
].join('; ');

/** <meta http-equiv> içinde geçersiz olan (header'a özgü) direktifleri ayıklar. */
export function cspForMeta(csp: string): string {
  return csp
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && !d.startsWith('frame-ancestors'))
    .join('; ');
}
