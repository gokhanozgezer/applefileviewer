import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listConversations } from '@main/modules/messages/listConversations';
import { listThread } from '@main/modules/messages/listThread';
import { withBackupRef } from '@main/ipc/guard';
import type {
  Conversation,
  MessagesConversationsRequest,
  MessagesThreadRequest,
  MessagesThreadResult,
} from '@shared/domain';

export function registerMessagesIpc(): void {
  ipcMain.handle(
    IPC.MESSAGES_CONVERSATIONS,
    withBackupRef(
      (req: MessagesConversationsRequest): Promise<Conversation[]> => listConversations(req),
    ),
  );
  ipcMain.handle(
    IPC.MESSAGES_THREAD,
    withBackupRef((req: MessagesThreadRequest): Promise<MessagesThreadResult> => listThread(req)),
  );
}
