// crypto/keybag — iTunes/Finder yedek keybag'i (Manifest.plist → BackupKeyBag) parse + unlock.
//
// Format (TLV): 4 karakter etiket + 4 bayt BIG-endian uzunluk + değer. 4 baytlık
// değerler big-endian uint olarak okunur. İlk UUID başlığa aittir; sonraki her UUID
// yeni bir sınıf-anahtarı bloğu başlatır (UUID, CLAS, WRAP, KTYP, WPKY[, PBKY]).
// Referans: jsharkey13/iphone_backup_decrypt utils.BackupKeyBag (iphone-dataprotection
// keybag.py türevi) — aynı semantik.
//
// Parola → anahtar (iOS 10.2+):
//   k1          = PBKDF2-HMAC-SHA256(parola, DPSL, DPIC, 32)
//   passcodeKey = PBKDF2-HMAC-SHA1(k1, SALT, ITER, 32)
// DPSL/DPIC yoksa (iOS < 10.2): passcodeKey = PBKDF2-HMAC-SHA1(parola, SALT, ITER, 32).
// WRAP & 2 olan sınıf anahtarları passcodeKey ile RFC 3394 unwrap edilir; herhangi
// birinde bütünlük hatası ⇒ WrongPasswordError.

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { aesUnwrap } from './aesKeyWrap';
import { EncryptedBackupFormatError, KeyUnwrapError, WrongPasswordError } from './errors';

const pbkdf2 = promisify(crypto.pbkdf2);

export const WRAP_DEVICE = 1;
export const WRAP_PASSCODE = 2;

/** Kötü niyetli iterasyon sayılarına üst sınır (referansla aynı: DPIC ≤ 20M, ITER ≤ 1M). */
const MAX_DPIC = 20_000_000;
const MAX_ITER = 1_000_000;

const CLASS_TAGS = new Set(['CLAS', 'WRAP', 'WPKY', 'KTYP', 'PBKY']);

export interface KeybagClassKey {
  uuid: Buffer;
  clas: number;
  wrap: number;
  ktyp: number | null;
  /** Sarılı sınıf anahtarı (40 bayt) — yoksa null (ör. yalnız PBKY taşıyan blok). */
  wpky: Buffer | null;
}

export interface Keybag {
  version: number | null;
  type: number | null;
  uuid: Buffer | null;
  wrap: number | null;
  salt: Buffer | null;
  iter: number | null;
  dpsl: Buffer | null;
  dpic: number | null;
  dpwt: number | null;
  /** Diğer başlık etiketleri (HMCK vb.) — ham değer. */
  attrs: Map<string, Buffer>;
  /** CLAS → sınıf bloğu. */
  classKeys: Map<number, KeybagClassKey>;
}

function u32(v: Buffer): number {
  return v.readUInt32BE(0);
}

/** TLV keybag'ini parse eder. Bozuk yapı → EncryptedBackupFormatError. */
export function parseKeybag(buf: Buffer): Keybag {
  if (!Buffer.isBuffer(buf) || buf.length < 8) {
    throw new EncryptedBackupFormatError('Keybag boş/geçersiz');
  }
  const kb: Keybag = {
    version: null,
    type: null,
    uuid: null,
    wrap: null,
    salt: null,
    iter: null,
    dpsl: null,
    dpic: null,
    dpwt: null,
    attrs: new Map(),
    classKeys: new Map(),
  };

  let current: Partial<KeybagClassKey> | null = null;
  const commit = (): void => {
    if (!current) return;
    if (current.clas === undefined || current.wrap === undefined || !current.uuid) {
      throw new EncryptedBackupFormatError('Keybag sınıf bloğu eksik (CLAS/WRAP)');
    }
    kb.classKeys.set(current.clas, {
      uuid: current.uuid,
      clas: current.clas,
      wrap: current.wrap,
      ktyp: current.ktyp ?? null,
      wpky: current.wpky ?? null,
    });
  };

  let off = 0;
  while (off + 8 <= buf.length) {
    const tag = buf.toString('latin1', off, off + 4);
    const len = buf.readUInt32BE(off + 4);
    const start = off + 8;
    if (start + len > buf.length) throw new EncryptedBackupFormatError('Keybag TLV sınır dışı');
    const val = Buffer.from(buf.subarray(start, start + len));
    off = start + len;

    if (tag === 'UUID') {
      if (kb.uuid === null) {
        kb.uuid = val; // ilk UUID başlığın
      } else {
        commit();
        current = { uuid: val };
      }
      continue;
    }

    if (current && CLASS_TAGS.has(tag)) {
      const num = len === 4 ? u32(val) : null;
      if (tag === 'CLAS' && num !== null) current.clas = num;
      else if (tag === 'WRAP' && num !== null) current.wrap = num;
      else if (tag === 'KTYP' && num !== null) current.ktyp = num;
      else if (tag === 'WPKY') current.wpky = val;
      // PBKY (asimetrik sınıf) çözümde kullanılmaz
      continue;
    }

    const num = len === 4 ? u32(val) : null;
    switch (tag) {
      case 'VERS':
        kb.version = num;
        break;
      case 'TYPE':
        kb.type = num;
        break;
      case 'WRAP':
        kb.wrap = num;
        break;
      case 'SALT':
        kb.salt = val;
        break;
      case 'ITER':
        kb.iter = num;
        break;
      case 'DPSL':
        kb.dpsl = val;
        break;
      case 'DPIC':
        kb.dpic = num;
        break;
      case 'DPWT':
        kb.dpwt = num;
        break;
      default:
        kb.attrs.set(tag, val);
    }
  }
  commit();

  if (kb.type !== null && kb.type > 3) {
    throw new EncryptedBackupFormatError(`Beklenmeyen keybag tipi ${kb.type}`);
  }
  return kb;
}

function validIter(v: number | null, name: string, max: number): number {
  if (v === null || !Number.isInteger(v) || v < 1 || v > max) {
    throw new EncryptedBackupFormatError(`Keybag ${name} iterasyon sayısı geçersiz`);
  }
  return v;
}

/** Paroladan passcodeKey türetir (async pbkdf2 → libuv threadpool; DPIC ~10M ⇒ saniyeler). */
export async function derivePasscodeKey(kb: Keybag, password: string): Promise<Buffer> {
  if (!kb.salt) throw new EncryptedBackupFormatError('Keybag SALT eksik');
  const iter = validIter(kb.iter, 'ITER', MAX_ITER);
  const pw = Buffer.from(password, 'utf8');
  try {
    if (kb.dpsl && kb.dpic !== null) {
      const dpic = validIter(kb.dpic, 'DPIC', MAX_DPIC);
      const k1 = await pbkdf2(pw, kb.dpsl, dpic, 32, 'sha256');
      try {
        return await pbkdf2(k1, kb.salt, iter, 32, 'sha1');
      } finally {
        k1.fill(0);
      }
    }
    return await pbkdf2(pw, kb.salt, iter, 32, 'sha1');
  } finally {
    pw.fill(0);
  }
}

/** passcodeKey ile parola-sarılı sınıf anahtarlarını açar. Bütünlük hatası ⇒ WrongPasswordError. */
export function unlockKeybagWithKey(kb: Keybag, passcodeKey: Buffer): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  try {
    for (const ck of kb.classKeys.values()) {
      if (!ck.wpky) continue;
      if ((ck.wrap & WRAP_PASSCODE) === 0) continue; // cihaz-sarılı: yedekte çözülemez
      try {
        out.set(ck.clas, aesUnwrap(passcodeKey, ck.wpky));
      } catch (e) {
        if (e instanceof KeyUnwrapError) throw new WrongPasswordError();
        throw new EncryptedBackupFormatError('Keybag sınıf anahtarı çözülemedi');
      }
    }
  } catch (e) {
    for (const k of out.values()) k.fill(0);
    throw e;
  }
  if (out.size === 0) {
    throw new EncryptedBackupFormatError('Keybag parola-sarılı sınıf anahtarı içermiyor');
  }
  return out;
}

/**
 * Keybag'i parolayla açar → CLAS → 32 baytlık sınıf anahtarı. Yanlış parola ⇒
 * WrongPasswordError. Parola/anahtar asla loglanmaz; ara anahtar sıfırlanır.
 */
export async function unlockKeybag(kb: Keybag, password: string): Promise<Map<number, Buffer>> {
  const passcodeKey = await derivePasscodeKey(kb, password);
  try {
    return unlockKeybagWithKey(kb, passcodeKey);
  } finally {
    passcodeKey.fill(0);
  }
}
