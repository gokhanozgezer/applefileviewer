// src/shared/persistence.ts
export interface PersistedUIState {
  'ui.theme': 'system' | 'light' | 'dark';
  'ui.backupRootOverride': string | null;
  'ui.lastSelectedUdid': string | null;
  'ui.sidebarCollapsed': boolean;
  'ui.listPanelWidth': Record<string, number>;
  'ui.lightbox.exifPanelOpen': boolean;
  'ui.lightbox.filmstripOpen': boolean;
  /** Açılışta sessiz güncelleme kontrolü (varsayılan açık). */
  'update.autoCheck': boolean;
  /** Son güncelleme kontrol denemesi (epoch ms) — sessiz kontrol 6 saatte bir. */
  'update.lastCheckAt': number | null;
}

export const PERSISTED_DEFAULTS: PersistedUIState = {
  'ui.theme': 'system',
  'ui.backupRootOverride': null,
  'ui.lastSelectedUdid': null,
  'ui.sidebarCollapsed': false,
  'ui.listPanelWidth': {},
  'ui.lightbox.exifPanelOpen': false,
  'ui.lightbox.filmstripOpen': false,
  'update.autoCheck': true,
  'update.lastCheckAt': null,
};
