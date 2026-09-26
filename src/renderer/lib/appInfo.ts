// src/renderer/lib/appInfo.ts
// Uygulama sürümü/geliştirici — package.json'dan vite `define` ile gelir
// (elle senkron tutulan sabit YOK). define'ın olmadığı ortamlarda (vitest)
// güvenli fallback.

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

export const APP_AUTHOR: string = typeof __APP_AUTHOR__ === 'string' ? __APP_AUTHOR__ : '';
