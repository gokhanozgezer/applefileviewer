// src/main/store.ts
import Store from 'electron-store';
import { PERSISTED_DEFAULTS, type PersistedUIState } from '@shared/persistence';

export const store = new Store<PersistedUIState>({
  defaults: PERSISTED_DEFAULTS,
  name: 'applefileviewer',
});
