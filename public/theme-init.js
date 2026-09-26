/* global localStorage, document */
// FOUC önleme: localStorage'dan son resolved theme'i oku, html'e set et.
// Harici dosya (inline değil) — prod CSP `script-src 'self'` inline script'e izin vermez.
(function () {
  try {
    var t = localStorage.getItem('afv:resolvedTheme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (_e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
