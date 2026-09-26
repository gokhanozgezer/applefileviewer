// crypto/encryptedBackup — şifreli yedek oturumu: Manifest.plist → keybag unlock →
// Manifest.db + tekil dosya çözümü. Anahtarlar YALNIZ bellekte; dispose() sıfırlar.
// Parola/anahtar asla loglanmaz, hata mesajlarına girmez.

import path from 'node:path';
import { createReadStream, readFile, removeOut } from '@main/safeFs';
import { parsePlist } from '@main/util/plist';
import { aesUnwrap } from './aesKeyWrap';
import { decryptFileStream } from './cbcStream';
import {
  DecryptError,
  EncryptedBackupFormatError,
  KeyUnwrapError,
  MissingClassKeyError,
  SessionDisposedError,
} from './errors';
import { parseFileRecord, type FileRecord } from './fileRecord';
import { parseKeybag, unlockKeybag, type Keybag } from './keybag';

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

export interface EncryptedBackupSession {
  readonly backupDir: string;
  /** Parse edilmiş keybag (yalnız meta; sarılı değerler — çözülmüş anahtar içermez). */
  readonly keybag: Keybag;
  /** Manifest.plist'te ManifestKey var mı (iOS 10.2+ → Manifest.db şifreli). */
  readonly manifestEncrypted: boolean;
  readonly disposed: boolean;
  /** <backupDir>/Manifest.db → outAbs (düz SQLite). ManifestKey yoksa düz kopya. */
  decryptManifestDb(outAbs: string, signal?: AbortSignal): Promise<void>;
  /** Manifest.db `Files.file` blob'u → { protectionClass, size, wrappedKey }. */
  parseFileRecord(blob: Buffer): FileRecord;
  /** Kaydın 32 baytlık dosya anahtarı (çağıran sahiplenir, işi bitince fill(0)); şifresizse null. */
  fileKey(record: FileRecord): Buffer | null;
  /** Akışlı çözüm, atomik (temp + rename); hata/abort'ta yarım çıktı silinir. Şifresiz kayıt → düz kopya. */
  decryptFileTo(
    inAbs: string,
    outAbs: string,
    record: FileRecord,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Tüm anahtar tamponlarını sıfırlar; sonraki kullanım SessionDisposedError. */
  dispose(): void;
}

function readManifestKey(v: unknown): { protectionClass: number; wrapped: Buffer } | null {
  if (v === undefined || v === null) return null;
  if (!Buffer.isBuffer(v) || v.length !== 44) {
    throw new EncryptedBackupFormatError('ManifestKey geçersiz');
  }
  // 4 bayt LITTLE-endian koruma sınıfı + 40 bayt sarılı anahtar
  return { protectionClass: v.readUInt32LE(0), wrapped: Buffer.from(v.subarray(4)) };
}

async function readHead(abs: string, n: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of createReadStream(abs, { start: 0, end: n - 1 })) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Şifreli yedeği açar: Manifest.plist okunur, keybag parolayla açılır (PBKDF2 async —
 * gerçek yedeklerde saniyeler sürer), Manifest.db anahtarı çözülür.
 * Hatalar: WrongPasswordError, EncryptedBackupFormatError, MissingClassKeyError.
 */
export async function openEncryptedBackup(
  backupDir: string,
  password: string,
): Promise<EncryptedBackupSession> {
  if (typeof password !== 'string')
    throw new TypeError('openEncryptedBackup: parola string olmalı');
  let raw: Buffer;
  try {
    raw = await readFile(path.join(backupDir, 'Manifest.plist'));
  } catch {
    throw new EncryptedBackupFormatError('Manifest.plist okunamadı');
  }
  const manifest = await parsePlist(raw);
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Buffer.isBuffer(manifest) ||
    manifest instanceof Date
  ) {
    throw new EncryptedBackupFormatError('Manifest.plist parse edilemedi');
  }
  if (manifest['IsEncrypted'] !== true) {
    throw new EncryptedBackupFormatError('Yedek şifreli değil');
  }
  const kbBuf = manifest['BackupKeyBag'];
  if (!Buffer.isBuffer(kbBuf)) throw new EncryptedBackupFormatError('BackupKeyBag eksik');
  const keybag = parseKeybag(kbBuf);
  const mk = readManifestKey(manifest['ManifestKey']);

  const classKeys = await unlockKeybag(keybag, password);

  let manifestDbKey: Buffer | null = null;
  if (mk) {
    const ck = classKeys.get(mk.protectionClass);
    if (!ck) {
      for (const k of classKeys.values()) k.fill(0);
      throw new MissingClassKeyError(mk.protectionClass);
    }
    try {
      manifestDbKey = aesUnwrap(ck, mk.wrapped);
    } catch (e) {
      for (const k of classKeys.values()) k.fill(0);
      if (e instanceof KeyUnwrapError)
        throw new EncryptedBackupFormatError('ManifestKey çözülemedi');
      throw e;
    }
  }

  let disposed = false;
  const assertLive = (): void => {
    if (disposed) throw new SessionDisposedError();
  };

  const fileKey = (record: FileRecord): Buffer | null => {
    assertLive();
    if (!record.wrappedKey) return null;
    const ck = classKeys.get(record.protectionClass);
    if (!ck) throw new MissingClassKeyError(record.protectionClass);
    if (record.wrappedKey.length !== 40) {
      throw new EncryptedBackupFormatError('Sarılı dosya anahtarı 40 bayt değil');
    }
    try {
      return aesUnwrap(ck, record.wrappedKey);
    } catch (e) {
      if (e instanceof KeyUnwrapError) throw new DecryptError('Dosya anahtarı çözülemedi');
      throw e;
    }
  };

  const session: EncryptedBackupSession = {
    backupDir,
    keybag,
    manifestEncrypted: mk !== null,
    get disposed() {
      return disposed;
    },

    async decryptManifestDb(outAbs, signal) {
      assertLive();
      // Oturum çözüm sırasında dispose edilebilir → anahtarın kopyası ile çalış
      const key = manifestDbKey ? Buffer.from(manifestDbKey) : null;
      try {
        await decryptFileStream({
          inAbs: path.join(backupDir, 'Manifest.db'),
          outAbs,
          key,
          policy: { mode: 'lenient' },
          signal,
        });
      } finally {
        key?.fill(0);
      }
      const head = await readHead(outAbs, SQLITE_MAGIC.length);
      if (!head.equals(SQLITE_MAGIC)) {
        await removeOut(outAbs).catch(() => undefined);
        throw new DecryptError('Manifest.db çözümü SQLite başlığı üretmedi');
      }
    },

    parseFileRecord(blob) {
      return parseFileRecord(blob);
    },

    fileKey,

    async decryptFileTo(inAbs, outAbs, record, signal) {
      const key = fileKey(record);
      try {
        await decryptFileStream({
          inAbs,
          outAbs,
          key,
          policy: { mode: 'file', size: record.size },
          signal,
        });
      } finally {
        key?.fill(0);
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const k of classKeys.values()) k.fill(0);
      classKeys.clear();
      manifestDbKey?.fill(0);
      manifestDbKey = null;
    },
  };
  return session;
}
