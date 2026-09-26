// src/renderer/keymap.ts
// Tek source-of-truth kısayol tablosu (MASTER.md §9).
// `?` overlay'i ve useGlobalKeymap() binding'leri AYNI array'den okur —
// yeni kısayol buraya eklenir, başka yerde tanımlanmaz.
import type { I18n } from './i18n';
import { getPlatform, type UiPlatform } from './lib/platform';

export type ShortcutGroup = keyof I18n['shortcuts']['groups'];
export type ShortcutLabelKey = keyof I18n['shortcuts']['labels'];

export type ShortcutScope = 'global' | 'photos' | 'lightbox';

/** Display-only girdiler için — global dispatcher'da asla eşleşmez. */
const DISPLAY_ONLY = (): boolean => false;

/**
 * Basit descriptor: ctrl=true → birincil modifier + key; Shift/Alt kabul edilmez.
 * Birincil modifier: Windows/Linux'ta Ctrl, macOS'ta ⌘ (Meta) — bkz. hasPrimaryModifier.
 */
export interface KeyDescriptor {
  ctrl: boolean;
  key: string;
}

export interface ShortcutDef {
  /** Benzersiz kimlik — useGlobalKeymap action dispatch'i bu id üzerinden yapar. */
  id: string;
  /**
   * Overlay'de gösterilen kanonik display string (ör. "Ctrl+1", "?"). "Ctrl" birincil
   * modifier'dır — macOS'ta formatShortcut/shortcutParts bunu ⌘ olarak gösterir.
   */
  keys: string;
  /** Aynı aksiyonun alternatif kombinasyonları (overlay'de "veya" ile gösterilir). */
  altKeys?: readonly string[];
  /** Descriptor ya da özel match fonksiyonu. */
  match: KeyDescriptor | ((e: KeyboardEvent, platform: UiPlatform) => boolean);
  /** tr.ts `shortcuts.labels` altındaki i18n anahtarı. */
  labelKey: ShortcutLabelKey;
  /** Overlay'de gruplama başlığı (tr.ts `shortcuts.groups`). */
  group: ShortcutGroup;
  /**
   * 'global' → useGlobalKeymap dispatch eder. 'photos' / 'lightbox' → YALNIZCA
   * overlay'de listelenir (display-only); asıl handler route/bileşen içinde
   * (PhotosRoute, PhotoGrid, Lightbox). Bu girdilerin match'i daima false döner.
   */
  scope: ShortcutScope;
  /** Navigasyon kısayolları için /backup/:udid altındaki modül path'i ('' = overview). */
  path?: string;
}

/** Sidebar sırası ile birebir aynı (Sidebar.tsx MODULES). */
export const SHORTCUTS: readonly ShortcutDef[] = [
  // — Navigasyon: Ctrl+1..9, sidebar sırasında —
  {
    id: 'nav-overview',
    keys: 'Ctrl+1',
    match: { ctrl: true, key: '1' },
    labelKey: 'navOverview',
    group: 'navigation',
    scope: 'global',
    path: '',
  },
  {
    id: 'nav-photos',
    keys: 'Ctrl+2',
    match: { ctrl: true, key: '2' },
    labelKey: 'navPhotos',
    group: 'navigation',
    scope: 'global',
    path: 'photos',
  },
  {
    id: 'nav-messages',
    keys: 'Ctrl+3',
    match: { ctrl: true, key: '3' },
    labelKey: 'navMessages',
    group: 'navigation',
    scope: 'global',
    path: 'messages',
  },
  {
    id: 'nav-whatsapp',
    keys: 'Ctrl+4',
    match: { ctrl: true, key: '4' },
    labelKey: 'navWhatsapp',
    group: 'navigation',
    scope: 'global',
    path: 'whatsapp',
  },
  {
    id: 'nav-calls',
    keys: 'Ctrl+5',
    match: { ctrl: true, key: '5' },
    labelKey: 'navCalls',
    group: 'navigation',
    scope: 'global',
    path: 'calls',
  },
  {
    id: 'nav-voicemail',
    keys: 'Ctrl+6',
    match: { ctrl: true, key: '6' },
    labelKey: 'navVoicemail',
    group: 'navigation',
    scope: 'global',
    path: 'voicemail',
  },
  {
    id: 'nav-notes',
    keys: 'Ctrl+7',
    match: { ctrl: true, key: '7' },
    labelKey: 'navNotes',
    group: 'navigation',
    scope: 'global',
    path: 'notes',
  },
  {
    id: 'nav-voicememos',
    keys: 'Ctrl+8',
    match: { ctrl: true, key: '8' },
    labelKey: 'navVoicememos',
    group: 'navigation',
    scope: 'global',
    path: 'voicememos',
  },
  {
    id: 'nav-contacts',
    keys: 'Ctrl+9',
    match: { ctrl: true, key: '9' },
    labelKey: 'navContacts',
    group: 'navigation',
    scope: 'global',
    path: 'contacts',
  },
  // — Pencere —
  {
    id: 'toggle-sidebar',
    keys: 'Ctrl+B',
    match: { ctrl: true, key: 'b' },
    labelKey: 'toggleSidebar',
    group: 'window',
    scope: 'global',
  },
  // — Genel —
  {
    id: 'open-settings',
    keys: 'Ctrl+,',
    match: { ctrl: true, key: ',' },
    labelKey: 'openSettings',
    group: 'general',
    scope: 'global',
  },
  {
    id: 'open-palette',
    keys: 'Ctrl+K',
    altKeys: ['Ctrl+F'],
    // Ctrl+K VE Ctrl+F aynı aksiyonu tetikler (global arama paleti).
    // Input odaktayken de çalışır — route içi arama kutuları Ctrl+F kullanmaz.
    match: (e, platform) =>
      hasPrimaryModifier(e, platform) &&
      !e.altKey &&
      !e.shiftKey &&
      (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f'),
    labelKey: 'openPalette',
    group: 'general',
    scope: 'global',
  },
  {
    id: 'help',
    keys: '?',
    altKeys: ['Ctrl+/'],
    // '?' fiziksel olarak Shift+/ — e.key doğrudan '?' üretir; modifier kombinasyonlarını dışla.
    // Ctrl+/ alternatifi: TR klavyede '/' Shift+7 olduğundan Shift serbest bırakılır;
    // edit alanı odaktayken de çalışır (Ctrl kombinasyonu).
    match: (e, platform) =>
      (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) ||
      (hasPrimaryModifier(e, platform) && !e.altKey && (e.key === '/' || e.code === 'Slash')),
    labelKey: 'help',
    group: 'general',
    scope: 'global',
  },
  // — Fotoğraflar (display-only; handler: PhotosRoute + PhotoGrid) —
  {
    id: 'photos-select-all',
    keys: 'Ctrl+A',
    match: DISPLAY_ONLY,
    labelKey: 'photosSelectAll',
    group: 'photos',
    scope: 'photos',
  },
  {
    id: 'photos-clear-selection',
    keys: 'Esc',
    match: DISPLAY_ONLY,
    labelKey: 'photosClearSelection',
    group: 'photos',
    scope: 'photos',
  },
  {
    id: 'photos-move-focus',
    keys: '←↑↓→',
    match: DISPLAY_ONLY,
    labelKey: 'photosMoveFocus',
    group: 'photos',
    scope: 'photos',
  },
  {
    id: 'photos-toggle-select',
    keys: 'Space',
    match: DISPLAY_ONLY,
    labelKey: 'photosToggleSelect',
    group: 'photos',
    scope: 'photos',
  },
  {
    id: 'photos-open',
    keys: 'Enter',
    match: DISPLAY_ONLY,
    labelKey: 'photosOpen',
    group: 'photos',
    scope: 'photos',
  },
  {
    id: 'photos-context-menu',
    keys: 'Shift+F10',
    match: DISPLAY_ONLY,
    labelKey: 'photosContextMenu',
    group: 'photos',
    scope: 'photos',
  },
  // — Fotoğraf görüntüleyici (display-only; handler: Lightbox) —
  // '+' Keys bileşeninde ayraç olarak bölündüğünden yakınlaştırma '=' ile gösterilir.
  {
    id: 'lightbox-prev',
    keys: '←',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxPrev',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-next',
    keys: '→',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxNext',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-zoom-in',
    keys: '=',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxZoomIn',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-zoom-out',
    keys: '-',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxZoomOut',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-zoom-reset',
    keys: '0',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxZoomReset',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-actual-size',
    keys: '1',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxActualSize',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-exif',
    keys: 'I',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxExif',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-fullscreen',
    keys: 'F',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxFullscreen',
    group: 'lightbox',
    scope: 'lightbox',
  },
  {
    id: 'lightbox-close',
    keys: 'Esc',
    match: DISPLAY_ONLY,
    labelKey: 'lightboxClose',
    group: 'lightbox',
    scope: 'lightbox',
  },
];

/** Overlay grup sırası. */
export const SHORTCUT_GROUP_ORDER: readonly ShortcutGroup[] = [
  'navigation',
  'window',
  'general',
  'photos',
  'lightbox',
];

/**
 * Platformun birincil kısayol modifier'ı basılı mı:
 *  - macOS: ⌘ (Meta) — Ctrl macOS'ta sistem/metin kısayollarıdır (Ctrl+1 = Mission Control
 *    masaüstü, Ctrl+A = satır başı); ⌘ ile birlikte Ctrl basılıysa eşleşmez.
 *  - Windows/Linux: Ctrl (Meta = Windows/Super tuşu; tarihsel olarak eşdeğer kabul edilir).
 */
export function hasPrimaryModifier(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>,
  platform: UiPlatform = getPlatform(),
): boolean {
  if (platform === 'darwin') return e.metaKey && !e.ctrlKey;
  return e.ctrlKey || e.metaKey;
}

export function matchesShortcut(
  e: KeyboardEvent,
  def: ShortcutDef,
  platform: UiPlatform = getPlatform(),
): boolean {
  if (typeof def.match === 'function') return def.match(e, platform);
  const mod = hasPrimaryModifier(e, platform);
  if (def.match.ctrl && (!mod || e.altKey || e.shiftKey)) return false;
  if (!def.match.ctrl && (mod || e.altKey)) return false;
  return e.key.toLowerCase() === def.match.key.toLowerCase();
}

export function shortcutById(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

// ─── Görüntüleme (platforma göre) ────────────────────────────────────────────
// Tablo kanonik "Ctrl+..." yazımını taşır; macOS'ta Apple konvansiyonu: sembol, ayraçsız
// (⌘B, ⇧F10, ⌘,). Windows/Linux'ta "Ctrl+B" olduğu gibi.

const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};

/** "Ctrl+1" → ["Ctrl","1"] (macOS: ["⌘","1"]). "Ctrl++" gibi '+' tuşu korunur. */
export function shortcutParts(keys: string, platform: UiPlatform = getPlatform()): string[] {
  // Sondaki '++' → son tuş '+' (ör. 'Ctrl++'); tek başına '+' de tuştur.
  const plusKey = keys === '+' || keys.endsWith('++');
  const body = keys === '+' ? '' : plusKey ? keys.slice(0, -2) : keys;
  const parts = body.split('+').filter((p) => p !== '');
  if (plusKey) parts.push('+');
  if (platform !== 'darwin') return parts;
  return parts.map((p) => MAC_SYMBOLS[p] ?? p);
}

/** Tooltip / metin içi gösterim: Windows/Linux "Ctrl+B", macOS "⌘B". */
export function formatShortcut(keys: string, platform: UiPlatform = getPlatform()): string {
  const parts = shortcutParts(keys, platform);
  return platform === 'darwin' ? parts.join('') : parts.join('+');
}
