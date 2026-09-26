// src/shared/ipc.ts
import type { Conversation, WaConversation } from './domain';

export const IPC = {
  THEME_GET: 'theme:get',
  THEME_SET: 'theme:set',
  THEME_PUSH: 'theme:push', // main → renderer
  // Backup
  BACKUP_LIST: 'backup:list',
  BACKUP_OPEN: 'backup:open',
  BACKUP_RESCAN: 'backup:rescan',
  BACKUP_PICK_FOLDER: 'backup:pickFolder',
  BACKUP_CLEAR_OVERRIDE: 'backup:clearOverride',
  /** macOS: Sistem Ayarları → Gizlilik ve Güvenlik → Tam Disk Erişimi panelini aç. */
  BACKUP_OPEN_FULL_DISK_ACCESS: 'backup:openFullDiskAccess',
  // Şifreli yedek — parola ile kilit aç (anahtarlar yalnız main belleğinde) / kilitle
  BACKUP_UNLOCK: 'backup:unlock',
  BACKUP_LOCK: 'backup:lock',
  // Photos
  PHOTOS_LIST: 'photos:list',
  PHOTOS_ALBUMS: 'photos:albums',
  // Messages (SMS / iMessage)
  MESSAGES_CONVERSATIONS: 'messages:conversations',
  MESSAGES_THREAD: 'messages:thread',
  // WhatsApp (ChatStorage.sqlite)
  WHATSAPP_CONVERSATIONS: 'whatsapp:conversations',
  WHATSAPP_THREAD: 'whatsapp:thread',
  // Calls (CallHistory.storedata)
  CALLS_LIST: 'calls:list',
  // Voicemail (voicemail.db)
  VOICEMAIL_LIST: 'voicemail:list',
  // Notes (NoteStore.sqlite — gzip+protobuf)
  NOTES_LIST: 'notes:list',
  // Voice Memos (CloudRecordings.db — ZCLOUDRECORDING)
  VOICEMEMOS_LIST: 'voicememos:list',
  // Contacts (AddressBook.sqlitedb — ABPerson ⨝ ABMultiValue)
  CONTACTS_LIST: 'contacts:list',
  // Media (video/audio transcode pre-warm)
  MEDIA_PREHEAT: 'media:preheat',
  // Global arama — komut paleti (mesaj/whatsapp/not/kişi)
  SEARCH_GLOBAL: 'search:global',
  // Cache yönetimi — Settings sayfası
  CACHE_STATS: 'cache:stats',
  CACHE_CLEAR: 'cache:clear',
  // Export (dialog.showSaveDialog → safeFs.writeFileOut)
  EXPORT_SAVE: 'export:save',
  // Export — orijinal medya dosyasını dışarı kopyala (Lightbox foto/video)
  EXPORT_COPY_MEDIA: 'export:copyMedia',
  // Export — çoklu seçim: tek klasör seçimi ile N dosya kopyala (Photos toplu export)
  EXPORT_COPY_MEDIA_BATCH: 'export:copyMediaBatch',
  // Dosyayı Windows Explorer'da göster (shell.showItemInFolder — gerçek hash'li dosya)
  FILE_SHOW_IN_FOLDER: 'file:showInFolder',
  // Export — tüm notlar → seçilen klasöre not başına bir TXT (main notları kendisi okur)
  EXPORT_NOTES_FOLDER: 'export:notesFolder',
  // Güncelleme (GitHub Releases — electron-updater / notify-only)
  UPDATE_GET: 'update:get',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_SET_AUTO_CHECK: 'update:setAutoCheck',
  UPDATE_OPEN_EXTERNAL: 'update:openExternal',
  UPDATE_PUSH: 'update:push', // main → renderer
} as const;

// ── Güncelleme ───────────────────────────────────────────────────────────────
// Uygulama imzasız: yalnız Windows NSIS kurulumu ve Linux AppImage kendini günceller
// ('auto'); macOS / Windows portable / .deb yalnız bildirir ('notify'); dev'de kapalı.

export type UpdateKind =
  | 'win-nsis'
  | 'win-portable'
  | 'mac'
  | 'linux-appimage'
  | 'linux-deb'
  | 'dev'
  | 'unsupported';

export type UpdateMode = 'auto' | 'notify' | 'disabled';

/** Sessiz (açılış) kontrol mü, kullanıcı mı başlattı — banner yalnız sessizde çıkar. */
export type UpdateCheckOrigin = 'silent' | 'manual';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking'; origin: UpdateCheckOrigin }
  | {
      status: 'available';
      version: string;
      /** Düz metin (HTML ayıklanmış) sürüm notları. */
      notes: string | null;
      date: string | null;
      origin: UpdateCheckOrigin;
    }
  | { status: 'not-available' }
  | {
      status: 'downloading';
      version: string;
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { status: 'downloaded'; version: string; notes: string | null; date: string | null }
  | { status: 'error'; message: string };

export interface UpdateSnapshot {
  currentVersion: string;
  kind: UpdateKind;
  mode: UpdateMode;
  autoCheck: boolean;
  /** GitHub releases sayfası (package.json repository'den); bilinmiyorsa null. */
  releasesUrl: string | null;
  /** Epoch ms — son kontrol denemesi. */
  lastCheckAt: number | null;
  state: UpdateState;
}

/** Renderer URL GÖNDERMEZ — main hedefi kendisi seçer. */
export type UpdateOpenTarget = 'releases' | 'download';

// ── Şifreli yedek kilidi ─────────────────────────────────────────────────────
// Parola yalnız bu istekte main'e geçer; main saklamaz/loglamaz. Sonuç tiplidir —
// yanlış parola bir hata (throw) değil, beklenen bir durumdur.

export interface BackupUnlockRequest {
  udid: string;
  rootPath: string;
  password: string;
}

export type BackupUnlockResult =
  | { status: 'ok' }
  | { status: 'wrongPassword' }
  | { status: 'error'; message: string };

export interface BackupLockRequest {
  udid: string;
}

export interface BackupLockResult {
  /** Açık bir oturum vardı ve kapatıldı. */
  locked: boolean;
}

export interface BackupPickFolderResult {
  canceled: boolean;
  valid?: boolean;
  path?: string;
  /** Klasör listelenemedi (EPERM/EACCES) — macOS'ta Tam Disk Erişimi yok. */
  permissionDenied?: boolean;
}

export interface OpenFullDiskAccessResult {
  /** false: macOS değil ya da Sistem Ayarları açılamadı. */
  opened: boolean;
}

export interface ShowInFolderRequest {
  udid: string;
  rootPath: string;
  fileId: string;
}

export interface ShowInFolderResult {
  shown: boolean;
  error?: string;
}

export interface MediaPreheatRequest {
  udid: string;
  fileId: string;
  to: 'mp4' | 'mp3';
}

export interface MediaPreheatResult {
  ready: boolean;
  error?: string;
}

// ── Export ───────────────────────────────────────────────────────────────────
// Renderer domain nesnelerini gönderir; main exportService ile string'e çevirir,
// dialog.showSaveDialog ile hedef seçtirir, safeFs.writeFileOut ile yazar.

export type ExportKind =
  | 'messageThread'
  | 'waThread'
  | 'contacts'
  | 'note'
  | 'callLog'
  | 'voicemails'
  | 'voiceMemos';

/**
 * messageThread/waThread payload'ı — mesajlar renderer'dan GÖNDERİLMEZ: renderer
 * yalnız yüklenmiş sayfaları tutar. Main udid+chatId/sessionId ile TÜM sayfaları
 * kendisi okur (backupRef guard'ından geçer). conversation başlık/ad içindir.
 */
export interface MessageThreadExportPayload {
  udid: string;
  rootPath: string;
  chatId: number;
  conversation: Conversation;
}

export interface WaThreadExportPayload {
  udid: string;
  rootPath: string;
  sessionId: number;
  conversation: WaConversation;
}

/** Tüm notlar → klasör (not başına TXT). */
export interface ExportNotesFolderRequest {
  udid: string;
  rootPath: string;
}

/** Klasöre çoklu yazma sonucu — copyMediaBatch ile aynı şekil. */
export type ExportNotesFolderResult = ExportCopyMediaBatchResult;

export interface ExportSaveRequest {
  kind: ExportKind;
  format: string; // 'json' | 'html' | 'csv' | 'vcard' | 'txt' — kind'e göre
  // payload, kind'e göre değişir (Conversation+Message[], Contact[], Note, CallRecord[])
  payload: unknown;
  suggestedName: string; // uzantısız öneri ad (örn. sohbet adı)
}

export interface ExportSaveResult {
  saved: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

export interface ExportCopyMediaRequest {
  udid: string;
  rootPath: string;
  fileId: string;
  suggestedName: string; // uzantı dahil önerilen dosya adı
}

export type ExportCopyMediaResult = ExportSaveResult;

export interface ExportCopyMediaBatchRequest {
  udid: string;
  rootPath: string;
  items: Array<{ fileId: string; suggestedName: string }>;
}

export interface ExportCopyMediaBatchResult {
  canceled?: boolean;
  /** Seçilen hedef klasör (iptal edilmediyse). */
  dir?: string;
  copied: number;
  failed: number;
  errors: string[]; // ilk birkaç hata mesajı (UI özeti için)
}

// ── Cache yönetimi (Settings) ────────────────────────────────────────────────

export interface CacheStats {
  /** userData/cache (thumb/jpeg/transcode) toplam bayt. */
  mediaCacheBytes: number;
  mediaCacheFiles: number;
  /** os.tmpdir/applefileviewer/sqlite snapshot toplam bayt. */
  sqliteTmpBytes: number;
  sqliteTmpFiles: number;
}

export interface CacheClearResult {
  removedFiles: number;
  freedBytes: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemePushPayload {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

// Main → renderer tipli hata kodları. Electron invoke hatasında yalnız message taşınır
// ("Error invoking remote method 'x': Error: [CODE] ..."), bu yüzden kod mesaj içinde
// köşeli parantezle gömülür; renderer ipcErrorCode ile geri okur.
export const IPC_ERROR_CODES = ['BACKUP_ENCRYPTED', 'INVALID_BACKUP_REF'] as const;
export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number];

export function ipcErrorCode(err: unknown): IpcErrorCode | null {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '');
  for (const code of IPC_ERROR_CODES) {
    if (msg.includes(`[${code}]`)) return code;
  }
  return null;
}
