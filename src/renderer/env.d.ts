// src/renderer/env.d.ts
// vite.config.ts `define` ile enjekte edilen derleme-zamanı sabitleri.
// Test ortamında (vitest, define yok) tanımsız olabilir — tüketiciler
// `typeof` guard'ı ile okur (bkz. lib/appInfo.ts).
declare const __APP_VERSION__: string;
declare const __APP_AUTHOR__: string;
