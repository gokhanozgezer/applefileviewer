import path from 'node:path';
import { readFile } from '@main/safeFs';
import { parsePlist, type PlistValue } from '@main/util/plist';
import { lookupDeviceName } from '@main/data/iosDevices';
import type { BackupDetails, BackupRootSource, BackupSummary } from '@shared/domain';

interface ParseInput {
  udid: string;
  rootPath: string;
  source: BackupRootSource;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}
function asBool(v: unknown): boolean {
  return v === true;
}
function asDateIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

interface ParseOutput {
  summary: BackupSummary;
  info: Record<string, PlistValue> | null;
}

async function parseInternal(input: ParseInput): Promise<ParseOutput> {
  const { udid, rootPath, source } = input;
  const backupDir = path.join(rootPath, udid);
  let infoDict: Record<string, PlistValue> | null = null;
  const summary: BackupSummary = {
    udid,
    rootPath,
    source,
    deviceName: null,
    productType: null,
    productName: null,
    productVersion: null,
    isEncrypted: false,
    // Manifest.plist başarıyla okunana dek bilinmiyor (fail closed)
    encryptionUnknown: true,
    lastBackupDate: null,
    totalSizeBytes: null,
    parseError: null,
  };

  // Info.plist hatası erken dönMEZ: Manifest.plist (IsEncrypted) her durumda okunur —
  // aksi halde isEncrypted false kalır ve şifreli yedek guard'ı fail-open olurdu.
  try {
    const infoBuf = await readFile(path.join(backupDir, 'Info.plist'));
    const info = (await parsePlist(infoBuf)) as Record<string, PlistValue> | null;
    if (!info) {
      summary.parseError = 'Info.plist parse edilemedi (bozuk veya boş)';
    } else {
      infoDict = info;
      summary.deviceName = asString(info['Device Name']) ?? asString(info['Display Name']);
      summary.productType = asString(info['Product Type']);
      summary.productName = summary.productType ? lookupDeviceName(summary.productType) : null;
      summary.productVersion = asString(info['Product Version']);
      summary.lastBackupDate = asDateIso(info['Last Backup Date']);
    }
  } catch (err) {
    summary.parseError = `Info.plist okunamadı: ${(err as Error).message}`;
  }

  try {
    const manifestBuf = await readFile(path.join(backupDir, 'Manifest.plist'));
    const manifest = (await parsePlist(manifestBuf)) as Record<string, PlistValue> | null;
    if (manifest) {
      summary.isEncrypted = asBool(manifest['IsEncrypted']);
      summary.encryptionUnknown = false;
      summary.lastBackupDate ??= asDateIso(manifest['Date']);
    } else if (!summary.parseError) {
      summary.parseError = 'Manifest.plist parse edilemedi (bozuk veya boş)';
    }
  } catch (err) {
    if (!summary.parseError) {
      summary.parseError = `Manifest.plist okunamadı: ${(err as Error).message}`;
    }
  }

  return { summary, info: infoDict };
}

export async function parseBackupPlists(input: ParseInput): Promise<BackupSummary> {
  return (await parseInternal(input)).summary;
}

/**
 * Info.plist'ten detay alanları (BACKUP_OPEN / genel bakış). Eksik anahtar null/[]
 * kalır — eski iOS yedeklerinde IMEI/telefon numarası/uygulama listesi olmayabilir.
 */
export function extractInfoDetails(
  info: Record<string, PlistValue> | null,
): Pick<BackupDetails, 'serialNumber' | 'buildVersion' | 'installedApps' | 'imei' | 'phoneNumber'> {
  if (!info) {
    return {
      serialNumber: null,
      buildVersion: null,
      installedApps: [],
      imei: null,
      phoneNumber: null,
    };
  }
  return {
    serialNumber: asNonEmptyString(info['Serial Number']),
    buildVersion: asNonEmptyString(info['Build Version']),
    installedApps: asStringArray(info['Installed Applications']),
    imei: asNonEmptyString(info['IMEI']),
    phoneNumber: asNonEmptyString(info['Phone Number']),
  };
}

/** Özet + Info.plist detayları tek okumada. */
export async function parseBackupDetails(input: ParseInput): Promise<BackupDetails> {
  const { summary, info } = await parseInternal(input);
  return { ...summary, ...extractInfoDetails(info) };
}
