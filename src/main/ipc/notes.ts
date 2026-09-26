import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listNotes } from '@main/modules/notes/listNotes';
import { withBackupRef } from '@main/ipc/guard';
import type { Note, NotesRequest } from '@shared/domain';

export function registerNotesIpc(): void {
  ipcMain.handle(
    IPC.NOTES_LIST,
    withBackupRef((req: NotesRequest): Promise<Note[]> => listNotes(req)),
  );
}
