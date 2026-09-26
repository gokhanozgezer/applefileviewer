/* global localStorage, document */
// Runs before first paint (sync in <head>) to avoid a light/dark flash.
(function () {
  try {
    var t = localStorage.getItem('afv-site-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch {
    /* storage blocked — follow the system theme */
  }
})();
