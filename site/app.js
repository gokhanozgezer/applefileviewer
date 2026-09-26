/* global window, document, navigator, location, localStorage, sessionStorage, history, fetch, URL, URLSearchParams, AbortController, matchMedia, setTimeout, clearTimeout */
// AppleFileViewer landing page logic — no dependencies, no trackers.
// Language (auto-detect + switcher + localStorage), theme toggle, OS-aware download
// button, tabs, and latest-release info from the GitHub API (graceful fallback).
(function () {
  'use strict';

  // ---- Repository (derived from the Pages URL, fallback for local preview / custom domain) ----
  var FALLBACK_OWNER = 'gokhanozgezer';
  var FALLBACK_REPO = 'applefileviewer';
  var owner = FALLBACK_OWNER;
  var repo = FALLBACK_REPO;
  var host = location.hostname.toLowerCase();
  if (/\.github\.io$/.test(host)) {
    owner = host.slice(0, -'.github.io'.length);
    var seg = location.pathname.split('/').filter(Boolean)[0];
    // Project site: https://OWNER.github.io/REPO/ ; a user site (OWNER.github.io) has no segment.
    if (seg && !/\.html?$/i.test(seg)) repo = decodeURIComponent(seg);
  }
  var REPO_URL = 'https://github.com/' + owner + '/' + repo;
  var API_LATEST = 'https://api.github.com/repos/' + owner + '/' + repo + '/releases/latest';
  function assetUrl(name) {
    return REPO_URL + '/releases/latest/download/' + name;
  }

  var ASSETS = {
    winSetup: 'AppleFileViewer-Windows-Setup.exe',
    winPortable: 'AppleFileViewer-Windows-Portable.exe',
    macArm: 'AppleFileViewer-macOS-arm64.dmg',
    macIntel: 'AppleFileViewer-macOS-x64.dmg',
    appImage: 'AppleFileViewer-Linux-x86_64.AppImage',
    deb: 'AppleFileViewer-Linux-amd64.deb',
  };

  // ---- Storage helpers (private mode / blocked storage must not break the page) ----
  function load(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  // ---- i18n ----
  var DICT = window.AFV_I18N || {};
  var SUPPORTED = ['en', 'tr', 'de', 'es', 'fr'];
  var LOCALE_TAGS = { en: 'en-US', tr: 'tr-TR', de: 'de-DE', es: 'es-ES', fr: 'fr-FR' };
  var lang = 'en';

  function detectLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && SUPPORTED.indexOf(q) >= 0) return q;
    var stored = load('afv-site-lang');
    if (stored && SUPPORTED.indexOf(stored) >= 0) return stored;
    var prefs =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language || 'en'];
    for (var i = 0; i < prefs.length; i++) {
      var base = String(prefs[i]).toLowerCase().split('-')[0];
      if (SUPPORTED.indexOf(base) >= 0) return base;
    }
    return 'en';
  }

  function t(key, vars) {
    var s = (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || '';
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(vars[k]);
      });
    }
    return s;
  }

  function applyLang(next) {
    lang = next;
    document.documentElement.lang = next;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (v) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-html'));
      if (v) el.innerHTML = v; // trusted static strings from i18n.js only
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-aria'));
      if (v) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-alt'));
      if (v) el.setAttribute('alt', v);
    });
    document.title = t('meta.title');
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.description'));
    var sel = document.getElementById('lang-select');
    if (sel) sel.value = next;
    renderDownload();
    renderRelease();
    if (lightboxRelabel) lightboxRelabel();
  }

  var lightboxRelabel = null;

  // ---- Theme ----
  function currentTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  function setupTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var sync = function () {
      btn.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    };
    sync();
    btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      save('afv-site-theme', next);
      sync();
    });
  }

  // ---- OS detection & download button ----
  var os = 'other';
  var macArch = 'arm64'; // Most Macs sold since late 2020 are Apple Silicon.
  function detectOs() {
    var p = (
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      ''
    ).toLowerCase();
    var ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod|android/.test(ua)) return 'mobile';
    if (p.indexOf('win') >= 0 || ua.indexOf('windows') >= 0) return 'windows';
    if (p.indexOf('mac') >= 0 || ua.indexOf('mac os') >= 0) return 'mac';
    if (p.indexOf('linux') >= 0 || ua.indexOf('linux') >= 0 || ua.indexOf('x11') >= 0)
      return 'linux';
    return 'other';
  }
  function detectMacArch() {
    // Chromium exposes the CPU architecture; Safari/Firefox do not → keep the arm64 default,
    // but a WebGL renderer string mentioning an Intel/AMD GPU is a strong x64 hint.
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData
        .getHighEntropyValues(['architecture'])
        .then(function (v) {
          if (v && v.architecture === 'x86') {
            macArch = 'x64';
            renderDownload();
          }
        })
        .catch(function () {});
      return;
    }
    try {
      var gl = document.createElement('canvas').getContext('webgl');
      var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      var r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      if (/intel|amd|radeon/i.test(r) && !/apple/i.test(r)) macArch = 'x64';
    } catch {
      /* ignore */
    }
  }

  function renderDownload() {
    document.querySelectorAll('a.dl[data-asset]').forEach(function (a) {
      a.href = assetUrl(a.getAttribute('data-asset'));
      a.classList.remove('recommended');
    });
    var primary = document.getElementById('primary-download');
    var label = document.getElementById('primary-label');
    var alt = document.getElementById('primary-alt');
    if (!primary || !label || !alt) return;
    var main = null;
    var osName = '';
    var altAsset = null;
    var altKey = '';
    if (os === 'windows') {
      main = ASSETS.winSetup;
      osName = 'Windows';
      altAsset = ASSETS.winPortable;
      altKey = 'hero.alt.windows';
    } else if (os === 'mac') {
      main = macArch === 'x64' ? ASSETS.macIntel : ASSETS.macArm;
      osName = macArch === 'x64' ? 'macOS (Intel)' : 'macOS (Apple Silicon)';
      altAsset = macArch === 'x64' ? ASSETS.macArm : ASSETS.macIntel;
      altKey = macArch === 'x64' ? 'hero.alt.macIntel' : 'hero.alt.macArm';
    } else if (os === 'linux') {
      main = ASSETS.appImage;
      osName = 'Linux';
      altAsset = ASSETS.deb;
      altKey = 'hero.alt.linux';
    }
    alt.textContent = '';
    if (main) {
      primary.href = assetUrl(main);
      label.textContent = t('hero.downloadFor', { os: osName });
      var rec = document.querySelector('a.dl[data-asset="' + main + '"]');
      if (rec) rec.classList.add('recommended');
      var link = document.createElement('a');
      link.href = assetUrl(altAsset);
      link.textContent = t(altKey);
      alt.appendChild(link);
    } else {
      primary.href = '#download';
      label.textContent = t('hero.downloadGeneric');
    }
  }

  // ---- Tabs (first-launch instructions) ----
  function setupTabs() {
    document.querySelectorAll('[data-tabs]').forEach(function (root) {
      var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
      function select(tab, focus) {
        tabs.forEach(function (t2) {
          var on = t2 === tab;
          t2.setAttribute('aria-selected', on ? 'true' : 'false');
          t2.tabIndex = on ? 0 : -1;
          var panel = document.getElementById(t2.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () {
          select(tab, false);
        });
        tab.addEventListener('keydown', function (e) {
          var n = null;
          if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
          else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
          else if (e.key === 'Home') n = tabs[0];
          else if (e.key === 'End') n = tabs[tabs.length - 1];
          if (n) {
            e.preventDefault();
            select(n, true);
          }
        });
      });
      var preferred = tabs.filter(function (tb) {
        return tb.getAttribute('data-os') === os;
      })[0];
      if (preferred) select(preferred, false);
    });
  }

  // ---- Latest release (GitHub API; unauthenticated limit is 60 req/h per IP → cached 1h) ----
  var release = null;
  function renderRelease() {
    var el = document.getElementById('release-info');
    if (!el) return;
    if (!release) {
      el.textContent = '';
      var a0 = document.createElement('a');
      a0.href = REPO_URL + '/releases/latest';
      a0.textContent = t('release.unknown');
      el.appendChild(a0);
      return;
    }
    var date = '';
    try {
      date = new Intl.DateTimeFormat(LOCALE_TAGS[lang] || lang, { dateStyle: 'medium' }).format(
        new Date(release.date),
      );
    } catch {
      date = release.date.slice(0, 10);
    }
    el.textContent = '';
    var a = document.createElement('a');
    a.href = release.url;
    a.textContent = t('release.info', { v: release.version, date: date });
    el.appendChild(a);
  }
  function fetchRelease() {
    var CACHE_KEY = 'afv-site-release:' + owner + '/' + repo;
    try {
      var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < 3600 * 1000) {
        release = cached.data;
        renderRelease();
        return;
      }
    } catch {
      /* ignore */
    }
    if (!window.fetch) return;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, 6000);
    fetch(API_LATEST, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl ? ctrl.signal : undefined,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.tag_name) return;
        release = {
          version: String(j.tag_name).replace(/^v/, ''),
          date: j.published_at || j.created_at,
          url: j.html_url || REPO_URL + '/releases/latest',
        };
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: release }));
        } catch {
          /* ignore */
        }
        renderRelease();
      })
      .catch(function () {
        /* offline / rate-limited / no release yet → keep the generic link */
      })
      .then(function () {
        clearTimeout(timer);
      });
  }

  // ---- Init ----
  function rewriteRepoLinks() {
    var gh = document.getElementById('gh-link');
    if (gh) gh.href = REPO_URL;
    var repoLink = document.getElementById('repo-link');
    if (repoLink) repoLink.href = REPO_URL;
    var lic = document.getElementById('license-link');
    if (lic) lic.href = REPO_URL + '/blob/main/LICENSE';
    var all = document.getElementById('all-releases');
    if (all) all.href = REPO_URL + '/releases';
  }

  // ---- Screenshot lightbox ----
  // Hero + gallery figures form one sequence; the opened image follows the site's
  // ACTIVE theme (shot-light / shot-dark). <dialog>.showModal gives a focus trap and
  // Esc; on close focus returns to the figure that opened it.
  function setupLightbox() {
    var dlg = document.getElementById('lightbox');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    var figs = Array.prototype.slice.call(
      document.querySelectorAll('.hero-shot, .shot-grid figure'),
    );
    if (!figs.length) return;
    var img = document.getElementById('lb-img');
    var cap = document.getElementById('lb-caption');
    var counter = document.getElementById('lb-counter');
    var index = 0;
    var opener = null;

    function captionOf(fig) {
      var fc = fig.querySelector('figcaption');
      if (fc) return fc.textContent.trim();
      var im = fig.querySelector('img');
      return im ? im.alt : '';
    }
    function srcOf(fig) {
      var variant = fig.querySelector(currentTheme() === 'dark' ? '.shot-dark' : '.shot-light');
      var im = variant || fig.querySelector('img');
      return im ? im.getAttribute('src') : '';
    }
    function show(i) {
      index = (i + figs.length) % figs.length;
      var fig = figs[index];
      var text = captionOf(fig);
      img.src = srcOf(fig);
      img.alt = text;
      cap.textContent = text;
      counter.textContent = index + 1 + ' / ' + figs.length;
      // Preload the neighbour so arrow navigation doesn't wait.
      var pre = document.createElement('img');
      pre.src = srcOf(figs[(index + 1) % figs.length]);
    }
    function open(i, from) {
      opener = from;
      if (figs.length < 2) dlg.setAttribute('data-single', '');
      show(i);
      dlg.showModal();
      document.body.style.overflow = 'hidden';
    }
    function labelAll() {
      figs.forEach(function (fig) {
        fig.setAttribute('aria-label', t('lb.open') + ': ' + captionOf(fig));
      });
    }

    figs.forEach(function (fig, i) {
      fig.tabIndex = 0;
      fig.setAttribute('role', 'button');
      fig.addEventListener('click', function () {
        open(i, fig);
      });
      fig.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i, fig);
        }
      });
    });
    labelAll();
    lightboxRelabel = labelAll;

    dlg.querySelector('.lb-close').addEventListener('click', function () {
      dlg.close();
    });
    dlg.querySelector('.lb-prev').addEventListener('click', function () {
      show(index - 1);
    });
    dlg.querySelector('.lb-next').addEventListener('click', function () {
      show(index + 1);
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
      else if (e.key === 'Home') show(0);
      else if (e.key === 'End') show(figs.length - 1);
      else return;
      e.preventDefault();
    });
    // Clicking outside the image (backdrop / empty area) closes.
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.classList.contains('lb-figure')) dlg.close();
    });
    // Touch swipe: horizontal >= 50px → previous/next.
    var x0 = null;
    dlg.addEventListener(
      'touchstart',
      function (e) {
        x0 = e.touches[0].clientX;
      },
      { passive: true },
    );
    dlg.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) >= 50) show(index + (dx < 0 ? 1 : -1));
    });
    dlg.addEventListener('close', function () {
      document.body.style.overflow = '';
      img.removeAttribute('src');
      if (opener) opener.focus();
    });
  }

  os = detectOs();
  if (os === 'mac') detectMacArch();
  rewriteRepoLinks();
  setupTheme();
  setupTabs();
  var sel = document.getElementById('lang-select');
  if (sel) {
    sel.addEventListener('change', function () {
      save('afv-site-lang', sel.value);
      applyLang(sel.value);
      // Keep ?lang= in sync so the URL is shareable (and matches hreflang alternates).
      try {
        var u = new URL(location.href);
        u.searchParams.set('lang', sel.value);
        history.replaceState(null, '', u);
      } catch {
        /* ignore */
      }
    });
  }
  applyLang(detectLang());
  setupLightbox();
  fetchRelease();
})();
