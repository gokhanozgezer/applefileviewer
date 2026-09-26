import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listVoiceMemos } from '@main/modules/voicememos/listVoiceMemos';
import { withBackupRef } from '@main/ipc/guard';
import type { VoiceMemo, VoiceMemosRequest } from '@shared/domain';

export function registerVoiceMemosIpc(): void {
  ipcMain.handle(
    IPC.VOICEMEMOS_LIST,
    withBackupRef((req: VoiceMemosRequest): Promise<VoiceMemo[]> => listVoiceMemos(req)),
  );
}
