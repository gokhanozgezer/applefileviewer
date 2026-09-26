// maintenance — Settings sayfası cache istatistik/temizlik IPC'leri.
// Medya cache (userData/cache) + SQLite tmp snapshot dizini birlikte raporlanır.
// fs işlemleri cache.ts helper'larında (fs gateway muafiyeti orada).

import { ipcMain } from 'electron';
import { IPC, type CacheStats, type CacheClearResult } from '@shared/ipc';
import { getCacheRoot, statsForDir, clearDirFiles } from '@main/cache';
import { TMP_CACHE_DIR } from '@main/util/sqlite';
import { logger } from '@main/util/log';

export function registerMaintenanceIpc(): void {
  ipcMain.handle(IPC.CACHE_STATS, async (): Promise<CacheStats> => {
    const [media, sqlite] = await Promise.all([
      statsForDir(getCacheRoot()),
      statsForDir(TMP_CACHE_DIR),
    ]);
    return {
      mediaCacheBytes: media.bytes,
      mediaCacheFiles: media.files,
      sqliteTmpBytes: sqlite.bytes,
      sqliteTmpFiles: sqlite.files,
    };
  });

  ipcMain.handle(IPC.CACHE_CLEAR, async (): Promise<CacheClearResult> => {
    const [media, sqlite] = await Promise.all([
      clearDirFiles(getCacheRoot()),
      clearDirFiles(TMP_CACHE_DIR),
    ]);
    const result = {
      removedFiles: media.removedFiles + sqlite.removedFiles,
      freedBytes: media.freedBytes + sqlite.freedBytes,
    };
    logger.info(
      `[maintenance] cache clear: ${result.removedFiles} dosya, ${(result.freedBytes / 1024 / 1024).toFixed(1)} MB`,
    );
    return result;
  });
}
