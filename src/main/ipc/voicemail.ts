import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listVoicemails } from '@main/modules/voicemail/listVoicemails';
import { withBackupRef } from '@main/ipc/guard';
import type { Voicemail, VoicemailRequest } from '@shared/domain';

export function registerVoicemailIpc(): void {
  ipcMain.handle(
    IPC.VOICEMAIL_LIST,
    withBackupRef((req: VoicemailRequest): Promise<Voicemail[]> => listVoicemails(req)),
  );
}
