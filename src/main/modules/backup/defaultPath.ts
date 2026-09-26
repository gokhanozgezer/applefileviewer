import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { BackupRootSource } from '@shared/domain';

/** Otomatik taranan (kullanıcı seçmediği) bir yedek kökü. */
export interface DefaultBackupRoot {
  path: string;
  source: Exclude<BackupRootSource, 'override'>;
}

/** Çözümleme girdileri — testte process.platform/env/home yerine enjekte edilir. */
export interface BackupPathContext {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  homeDir: string;
  /** Windows'ta Electron'un appData yolu (SHGetKnownFolderPath) — yoksa %APPDATA%. */
  appDataDir?: string | null;
}

function isAbsoluteFor(platform: NodeJS.Platform, p: string): boolean {
  return platform === 'win32' ? path.win32.isAbsolute(p) : path.posix.isAbsolute(p);
}

/**
 * Platforma göre varsayılan yedek kökleri (Electron'suz, saf):
 *  - Windows: klasik iTunes (%APPDATA%\Apple Computer\MobileSync\Backup) VE
 *    Microsoft Store iTunes / Apple Devices uygulaması (%USERPROFILE%\Apple\MobileSync\Backup)
 *  - macOS: ~/Library/Application Support/MobileSync/Backup (Finder/iTunes; Tam Disk Erişimi ister)
 *  - Linux: iTunes yok; libimobiledevice (`idevicebackup2 backup <klasör>`) iyi bilinen bir
 *    varsayılan klasör kullanmaz → kök yok, kullanıcı klasörü seçer.
 * `AFV_BACKUP_DIR` (mutlak yol) set ise TEK kök odur — e2e izolasyonu ve taşınmış yedek
 * kökleri için (bkz. src/main/pathOverrides.ts).
 */
export function resolveDefaultBackupRoots(ctx: BackupPathContext): DefaultBackupRoot[] {
  const envOverride = ctx.env.AFV_BACKUP_DIR;
  if (envOverride && isAbsoluteFor(ctx.platform, envOverride)) {
    return [{ path: envOverride, source: 'env' }];
  }

  if (ctx.platform === 'win32') {
    const w = path.win32;
    const appData = ctx.appDataDir || ctx.env.APPDATA || w.join(ctx.homeDir, 'AppData', 'Roaming');
    const profile = ctx.env.USERPROFILE || ctx.homeDir;
    const roots: DefaultBackupRoot[] = [
      { path: w.join(appData, 'Apple Computer', 'MobileSync', 'Backup'), source: 'itunes' },
      { path: w.join(profile, 'Apple', 'MobileSync', 'Backup'), source: 'appleDevices' },
    ];
    // Aynı klasöre çözülen iki kök (olağandışı profil yönlendirmesi) iki kez taranmasın.
    const seen = new Set<string>();
    return roots.filter((r) => {
      const k = w.resolve(r.path).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (ctx.platform === 'darwin') {
    return [
      {
        path: path.posix.join(
          ctx.homeDir,
          'Library',
          'Application Support',
          'MobileSync',
          'Backup',
        ),
        source: 'finder',
      },
    ];
  }

  return [];
}

/** Çalışan süreç için varsayılan yedek kökleri. */
export function getDefaultBackupRoots(): DefaultBackupRoot[] {
  let appDataDir: string | null = null;
  if (process.platform === 'win32') {
    try {
      appDataDir = app.getPath('appData');
    } catch {
      appDataDir = null; // app hazır değil / test — %APPDATA%'ya düş
    }
  }
  return resolveDefaultBackupRoots({
    platform: process.platform,
    env: process.env,
    homeDir: os.homedir(),
    appDataDir,
  });
}

/** Yalnız yol listesi — guard / safeFs koruması için. */
export function getDefaultBackupPaths(): string[] {
  return getDefaultBackupRoots().map((r) => r.path);
}
