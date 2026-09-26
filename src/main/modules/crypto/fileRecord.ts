// crypto/fileRecord — Manifest.db `Files.file` blob'u (NSKeyedArchiver binary plist) → MBFile.
//
// Yapı: { $archiver: 'NSKeyedArchiver', $version: 100000, $top: { root: UID },
//         $objects: ['$null', MBFile{...}, ...] }
// MBFile: ProtectionClass (int), Size (int), EncryptionKey (UID → { 'NS.data': 4 bayt
// LE sınıf + 40 bayt sarılı anahtar, $class: UID }). EncryptionKey yoksa dosya
// şifresiz (dizin, symlink, boş dosya).
// Referans: jsharkey13/iphone_backup_decrypt utils.FilePlist — sarılı anahtar
// NS.data[4:], sınıf MBFile.ProtectionClass'tan alınır (NS.data'nın ilk 4 baytı değil).

import { parseBplist, PlistUid, type BplistValue } from '@main/util/bplist';
import { EncryptedBackupFormatError } from './errors';

export interface FileRecord {
  protectionClass: number;
  /** MBFile.Size (bayt); yoksa 0. Canlı DB'lerde gerçek boyuttan sapabilir. */
  size: number;
  /** 40 baytlık RFC 3394 sarılı dosya anahtarı; şifresiz kayıtta null. */
  wrappedKey: Buffer | null;
}

type Dict = { [k: string]: BplistValue };

function isDict(v: unknown): v is Dict {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !Buffer.isBuffer(v) &&
    !(v instanceof Date) &&
    !(v instanceof PlistUid)
  );
}

function toInt(v: BplistValue | undefined, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'bigint') {
    if (v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(v);
  }
  return fallback;
}

/** Nesne ya doğrudan değer ya da $objects içine UID referansı olabilir. */
function deref(objects: BplistValue[], v: BplistValue | undefined): BplistValue | undefined {
  if (v instanceof PlistUid) return objects[v.uid];
  return v;
}

/** `Files.file` blob'unu çözer. Beklenmeyen yapı → EncryptedBackupFormatError. */
export function parseFileRecord(blob: Buffer): FileRecord {
  let top: BplistValue;
  try {
    top = parseBplist(blob);
  } catch {
    throw new EncryptedBackupFormatError('MBFile plist parse edilemedi');
  }
  if (!isDict(top)) throw new EncryptedBackupFormatError('MBFile arşivi dict değil');
  const objects = top['$objects'];
  const topDict = top['$top'];
  if (!Array.isArray(objects) || !isDict(topDict)) {
    throw new EncryptedBackupFormatError('NSKeyedArchiver $objects/$top eksik');
  }
  const root = deref(objects, topDict['root']);
  if (!isDict(root)) throw new EncryptedBackupFormatError('MBFile kök nesnesi bulunamadı');

  const protectionClass = toInt(root['ProtectionClass'], 0);
  const size = Math.max(0, toInt(root['Size'], 0));

  let wrappedKey: Buffer | null = null;
  const encObj = deref(objects, root['EncryptionKey']);
  if (encObj !== undefined && encObj !== null && encObj !== '$null') {
    const nsData = isDict(encObj) ? deref(objects, encObj['NS.data']) : encObj;
    if (!Buffer.isBuffer(nsData) || nsData.length !== 44) {
      throw new EncryptedBackupFormatError('MBFile EncryptionKey NS.data geçersiz');
    }
    wrappedKey = Buffer.from(nsData.subarray(4));
  }
  return { protectionClass, size, wrappedKey };
}
