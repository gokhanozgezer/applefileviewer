import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { globalSearch } from '@main/modules/search/globalSearch';
import { withBackupRef } from '@main/ipc/guard';
import type { GlobalSearchRequest, GlobalSearchResult } from '@shared/domain';

export function registerSearchIpc(): void {
  ipcMain.handle(
    IPC.SEARCH_GLOBAL,
    withBackupRef((req: GlobalSearchRequest): Promise<GlobalSearchResult> => globalSearch(req)),
  );
}
