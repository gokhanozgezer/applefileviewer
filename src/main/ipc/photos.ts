import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { listPhotos } from '@main/modules/photos/listPhotos';
import { listAlbums } from '@main/modules/photos/listAlbums';
import { withBackupRef } from '@main/ipc/guard';
import type { PhotoAlbum, PhotoAlbumsRequest, PhotosRequest, PhotosResult } from '@shared/domain';

export function registerPhotosIpc(): void {
  ipcMain.handle(
    IPC.PHOTOS_LIST,
    withBackupRef((req: PhotosRequest): Promise<PhotosResult> => listPhotos(req)),
  );
  ipcMain.handle(
    IPC.PHOTOS_ALBUMS,
    withBackupRef((req: PhotoAlbumsRequest): Promise<PhotoAlbum[]> => listAlbums(req)),
  );
}
