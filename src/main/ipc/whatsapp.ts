import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listWaConversations } from '@main/modules/whatsapp/listWaConversations';
import { listWaThread } from '@main/modules/whatsapp/listWaThread';
import { withBackupRef } from '@main/ipc/guard';
import type {
  WaConversation,
  WaConversationsRequest,
  WaThreadRequest,
  WaThreadResult,
} from '@shared/domain';

export function registerWhatsAppIpc(): void {
  ipcMain.handle(
    IPC.WHATSAPP_CONVERSATIONS,
    withBackupRef(
      (req: WaConversationsRequest): Promise<WaConversation[]> => listWaConversations(req),
    ),
  );
  ipcMain.handle(
    IPC.WHATSAPP_THREAD,
    withBackupRef((req: WaThreadRequest): Promise<WaThreadResult> => listWaThread(req)),
  );
}
