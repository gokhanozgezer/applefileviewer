import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listContacts } from '@main/modules/contacts/listContacts';
import { withBackupRef } from '@main/ipc/guard';
import type { Contact, ContactsRequest } from '@shared/domain';

export function registerContactsIpc(): void {
  ipcMain.handle(
    IPC.CONTACTS_LIST,
    withBackupRef((req: ContactsRequest): Promise<Contact[]> => listContacts(req)),
  );
}
