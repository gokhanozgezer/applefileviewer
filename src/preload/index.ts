// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type ThemeMode,
  type ThemePushPayload,
  type MediaPreheatRequest,
  type MediaPreheatResult,
  type ExportSaveRequest,
  type ExportSaveResult,
  type ExportCopyMediaRequest,
  type ExportCopyMediaResult,
  type ExportCopyMediaBatchRequest,
  type ExportCopyMediaBatchResult,
  type ExportNotesFolderRequest,
  type ExportNotesFolderResult,
  type ShowInFolderRequest,
  type ShowInFolderResult,
  type CacheStats,
  type CacheClearResult,
  type BackupUnlockRequest,
  type BackupUnlockResult,
  type BackupLockRequest,
  type BackupLockResult,
  type BackupPickFolderResult,
  type OpenFullDiskAccessResult,
  type UpdateSnapshot,
  type UpdateOpenTarget,
} from '@shared/ipc';
import type {
  ScanResult,
  BackupDetails,
  PhotosRequest,
  PhotosResult,
  PhotoAlbum,
  PhotoAlbumsRequest,
  Conversation,
  MessagesConversationsRequest,
  MessagesThreadRequest,
  MessagesThreadResult,
  WaConversation,
  WaConversationsRequest,
  WaThreadRequest,
  WaThreadResult,
  CallRecord,
  CallsRequest,
  Voicemail,
  VoicemailRequest,
  Note,
  NotesRequest,
  VoiceMemo,
  VoiceMemosRequest,
  Contact,
  ContactsRequest,
  GlobalSearchRequest,
  GlobalSearchResult,
} from '@shared/domain';

const api = {
  /**
   * Çalışan işletim sistemi ('win32' | 'darwin' | 'linux' ...) — salt okunur sabit.
   * Renderer platforma göre başlık çubuğu, kısayol (Ctrl/⌘) ve metin seçer.
   */
  platform: process.platform,
  // Güncelleme — main durum değişimlerini UPDATE_PUSH ile iter.
  updater: {
    get: (): Promise<UpdateSnapshot> => ipcRenderer.invoke(IPC.UPDATE_GET),
    check: (): Promise<UpdateSnapshot> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    download: (): Promise<UpdateSnapshot> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    setAutoCheck: (value: boolean): Promise<UpdateSnapshot> =>
      ipcRenderer.invoke(IPC.UPDATE_SET_AUTO_CHECK, value),
    openExternal: (target: UpdateOpenTarget): Promise<boolean> =>
      ipcRenderer.invoke(IPC.UPDATE_OPEN_EXTERNAL, target),
    onPush: (cb: (s: UpdateSnapshot) => void): (() => void) => {
      const handler = (_: unknown, snap: UpdateSnapshot) => cb(snap);
      ipcRenderer.on(IPC.UPDATE_PUSH, handler);
      return () => ipcRenderer.off(IPC.UPDATE_PUSH, handler);
    },
  },
  theme: {
    get: (): Promise<ThemePushPayload> => ipcRenderer.invoke(IPC.THEME_GET),
    set: (mode: ThemeMode): Promise<ThemePushPayload> => ipcRenderer.invoke(IPC.THEME_SET, mode),
    onPush: (cb: (p: ThemePushPayload) => void): (() => void) => {
      const handler = (_: unknown, payload: ThemePushPayload) => cb(payload);
      ipcRenderer.on(IPC.THEME_PUSH, handler);
      return () => ipcRenderer.off(IPC.THEME_PUSH, handler);
    },
  },
  backup: {
    list: (): Promise<ScanResult> => ipcRenderer.invoke(IPC.BACKUP_LIST),
    rescan: (): Promise<ScanResult> => ipcRenderer.invoke(IPC.BACKUP_RESCAN),
    open: (payload: { udid: string; rootPath: string }): Promise<BackupDetails> =>
      ipcRenderer.invoke(IPC.BACKUP_OPEN, payload),
    pickFolder: (): Promise<BackupPickFolderResult> => ipcRenderer.invoke(IPC.BACKUP_PICK_FOLDER),
    // macOS: Sistem Ayarları → Tam Disk Erişimi (URL main'de sabit; renderer URL vermez).
    openFullDiskAccessSettings: (): Promise<OpenFullDiskAccessResult> =>
      ipcRenderer.invoke(IPC.BACKUP_OPEN_FULL_DISK_ACCESS),
    clearOverride: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.BACKUP_CLEAR_OVERRIDE),
    // Parola yalnız bu çağrıda main'e geçer; renderer'da saklanmaz.
    unlock: (req: BackupUnlockRequest): Promise<BackupUnlockResult> =>
      ipcRenderer.invoke(IPC.BACKUP_UNLOCK, req),
    lock: (req: BackupLockRequest): Promise<BackupLockResult> =>
      ipcRenderer.invoke(IPC.BACKUP_LOCK, req),
  },
  photos: {
    list: (req: PhotosRequest): Promise<PhotosResult> => ipcRenderer.invoke(IPC.PHOTOS_LIST, req),
    albums: (req: PhotoAlbumsRequest): Promise<PhotoAlbum[]> =>
      ipcRenderer.invoke(IPC.PHOTOS_ALBUMS, req),
  },
  messages: {
    conversations: (req: MessagesConversationsRequest): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC.MESSAGES_CONVERSATIONS, req),
    thread: (req: MessagesThreadRequest): Promise<MessagesThreadResult> =>
      ipcRenderer.invoke(IPC.MESSAGES_THREAD, req),
  },
  whatsapp: {
    conversations: (req: WaConversationsRequest): Promise<WaConversation[]> =>
      ipcRenderer.invoke(IPC.WHATSAPP_CONVERSATIONS, req),
    thread: (req: WaThreadRequest): Promise<WaThreadResult> =>
      ipcRenderer.invoke(IPC.WHATSAPP_THREAD, req),
  },
  calls: {
    list: (req: CallsRequest): Promise<CallRecord[]> => ipcRenderer.invoke(IPC.CALLS_LIST, req),
  },
  voicemail: {
    list: (req: VoicemailRequest): Promise<Voicemail[]> =>
      ipcRenderer.invoke(IPC.VOICEMAIL_LIST, req),
  },
  notes: {
    list: (req: NotesRequest): Promise<Note[]> => ipcRenderer.invoke(IPC.NOTES_LIST, req),
  },
  voicememos: {
    list: (req: VoiceMemosRequest): Promise<VoiceMemo[]> =>
      ipcRenderer.invoke(IPC.VOICEMEMOS_LIST, req),
  },
  contacts: {
    list: (req: ContactsRequest): Promise<Contact[]> => ipcRenderer.invoke(IPC.CONTACTS_LIST, req),
  },
  media: {
    preheat: (req: MediaPreheatRequest): Promise<MediaPreheatResult> =>
      ipcRenderer.invoke(IPC.MEDIA_PREHEAT, req),
  },
  search: {
    global: (req: GlobalSearchRequest): Promise<GlobalSearchResult> =>
      ipcRenderer.invoke(IPC.SEARCH_GLOBAL, req),
  },
  maintenance: {
    cacheStats: (): Promise<CacheStats> => ipcRenderer.invoke(IPC.CACHE_STATS),
    cacheClear: (): Promise<CacheClearResult> => ipcRenderer.invoke(IPC.CACHE_CLEAR),
  },
  export: {
    save: (req: ExportSaveRequest): Promise<ExportSaveResult> =>
      ipcRenderer.invoke(IPC.EXPORT_SAVE, req),
    copyMedia: (req: ExportCopyMediaRequest): Promise<ExportCopyMediaResult> =>
      ipcRenderer.invoke(IPC.EXPORT_COPY_MEDIA, req),
    copyMediaBatch: (req: ExportCopyMediaBatchRequest): Promise<ExportCopyMediaBatchResult> =>
      ipcRenderer.invoke(IPC.EXPORT_COPY_MEDIA_BATCH, req),
    notesFolder: (req: ExportNotesFolderRequest): Promise<ExportNotesFolderResult> =>
      ipcRenderer.invoke(IPC.EXPORT_NOTES_FOLDER, req),
    showInFolder: (req: ShowInFolderRequest): Promise<ShowInFolderResult> =>
      ipcRenderer.invoke(IPC.FILE_SHOW_IN_FOLDER, req),
  },
};

contextBridge.exposeInMainWorld('api', api);
export type AppAPI = typeof api;
