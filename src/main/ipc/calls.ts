import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listCalls } from '@main/modules/calls/listCalls';
import { withBackupRef } from '@main/ipc/guard';
import type { CallRecord, CallsRequest } from '@shared/domain';

export function registerCallsIpc(): void {
  ipcMain.handle(
    IPC.CALLS_LIST,
    withBackupRef((req: CallsRequest): Promise<CallRecord[]> => listCalls(req)),
  );
}
