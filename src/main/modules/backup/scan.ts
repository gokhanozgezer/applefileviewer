import path from 'node:path';
import { readdir, stat } from '@main/safeFs';
import { parseBackupPlists } from './parsePlists';
import type { DefaultBackupRoot } from './defaultPath';
import type {
  BackupRootInfo,
  BackupRootSource,
  BackupRootState,
  BackupSummary,
  ScanResult,
} from '@shared/domain';
import { logger } from '@main/util/log';

interface ScanInput {
  /** Otomatik taranan kökler (defaultPath.ts#getDefaultBackupRoots). */
  defaultRoots: readonly DefaultBackupRoot[];
  overridePath: string | null;
  /** Test için enjekte edilebilir — Tam Disk Erişimi uyarısı yalnız macOS'ta anlamlı. */
  platform?: NodeJS.Platform;
}

const UDID_RE = /^[a-f0-9-]{25,40}$/i;

function normRoot(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * rootPath'in hangi taranan köke ait olduğu — BACKUP_OPEN'da gerçek kaynağı döndürmek
 * için. Varsayılan köklerle eşleşme önceliklidir; hiçbiri değilse override (guard zaten
 * izinli kök dışını reddeder).
 */
export function resolveBackupSource(
  rootPath: string,
  defaultRoots: readonly DefaultBackupRoot[],
  overridePath: string | null,
): BackupRootSource {
  const r = normRoot(rootPath);
  const hit = defaultRoots.find((d) => normRoot(d.path) === r);
  if (hit) return hit.source;
  if (overridePath && r === normRoot(overridePath)) return 'override';
  return defaultRoots[0]?.source ?? 'override';
}

function isPermissionError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return code === 'EPERM' || code === 'EACCES';
}

interface RootProbe {
  state: BackupRootState;
  entries: string[];
}

/**
 * Kökü yokla: yok → missing; macOS TCC korumasında klasörün stat'ı çoğu zaman başarılı
 * olur ama listelemesi EPERM verir → permissionDenied (Tam Disk Erişimi gerekir).
 */
async function probeRoot(p: string): Promise<RootProbe> {
  try {
    const s = await stat(p);
    if (!s.isDirectory()) return { state: 'missing', entries: [] };
  } catch (e) {
    if (isPermissionError(e)) return { state: 'permissionDenied', entries: [] };
    return { state: 'missing', entries: [] };
  }
  try {
    return { state: 'ok', entries: await readdir(p) };
  } catch (e) {
    if (isPermissionError(e)) return { state: 'permissionDenied', entries: [] };
    throw e;
  }
}

async function scanEntries(
  rootPath: string,
  entries: readonly string[],
  source: BackupRootSource,
): Promise<BackupSummary[]> {
  const backups: BackupSummary[] = [];
  for (const name of entries) {
    if (!UDID_RE.test(name)) continue;
    const candidate = path.join(rootPath, name);
    try {
      const s = await stat(candidate);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    backups.push(await parseBackupPlists({ udid: name, rootPath, source }));
  }
  return backups;
}

export async function scanBackupRoots(input: ScanInput): Promise<ScanResult> {
  const { defaultRoots, overridePath } = input;
  const platform = input.platform ?? process.platform;
  const errors: string[] = [];
  const backups: BackupSummary[] = [];
  const roots: BackupRootInfo[] = [];

  const targets: { path: string; source: BackupRootSource }[] = [...defaultRoots];
  // Override bir varsayılan kökle aynıysa iki kez taranmaz (yinelenen kart olmasın).
  if (overridePath && !defaultRoots.some((d) => normRoot(d.path) === normRoot(overridePath))) {
    targets.push({ path: overridePath, source: 'override' });
  }

  for (const t of targets) {
    let state: BackupRootState;
    try {
      const probe = await probeRoot(t.path);
      state = probe.state;
      if (state === 'ok') backups.push(...(await scanEntries(t.path, probe.entries, t.source)));
      else if (state === 'permissionDenied') {
        logger.warn(`[backup] ${t.source} kökü okunamadı (izin yok): ${t.path}`);
      }
    } catch (e) {
      state = 'error';
      errors.push(`${t.source} scan failed: ${(e as Error).message}`);
      logger.error(`${t.source} scan failed: ${(e as Error).message}`);
    }
    roots.push({ path: t.path, source: t.source, state });
  }

  backups.sort((a, b) => (b.lastBackupDate ?? '').localeCompare(a.lastBackupDate ?? ''));

  const overrideInfo = overridePath
    ? roots.find((r) => normRoot(r.path) === normRoot(overridePath))
    : undefined;

  return {
    roots,
    overridePath,
    overridePathAccessible: overrideInfo?.state === 'ok',
    fullDiskAccessRequired:
      platform === 'darwin' && roots.some((r) => r.state === 'permissionDenied'),
    backups,
    errors,
  };
}
