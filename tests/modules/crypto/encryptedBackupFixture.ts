// Şifreli yedek fixture'ı: bu uygulamanın DÜZ yedek düzenindeki bir klasörü
// (<backupDir>/<xx>/<fileId>, fileId = sha1(`${domain}-${relativePath}`), Info.plist,
// Manifest.plist) bayt-doğru bir ŞİFRELİ iTunes/Finder yedeğine dönüştürür:
//   - rastgele sınıf anahtarları (CLAS 1..11), parola-anahtarıyla RFC 3394 sarılı (WRAP=2)
//   - Manifest.plist (binary): IsEncrypted=true, BackupKeyBag (TLV), ManifestKey
//     (4 bayt LE sınıf + 40 bayt sarılı anahtar)
//   - Manifest.db: gerçek Files (+ Properties) tablosu, NSKeyedArchiver MBFile blob'ları;
//     tüm dosya AES-256-CBC, IV=0, PKCS7
//   - her dosya: rastgele dosya anahtarı, AES-256-CBC IV=0 PKCS7
// Testlerde hız için DPIC/ITER küçük (varsayılan 10); üretim değerleri keybag'den okunur.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import plist from 'plist';
import { computeFileId } from '@main/modules/manifest/fileId';
import { aesWrap } from '@main/modules/crypto/aesKeyWrap';
import { PlistUid } from '@main/util/bplist';
import { writeBplist, type WritableValue } from './bplistWriter';

const ZERO_IV = Buffer.alloc(16);
export const FIXTURE_CLASSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
/** Gerçek yedeklerde dosyaların çoğu: NSFileProtectionCompleteUntilFirstUserAuthentication. */
export const DEFAULT_FILE_CLASS = 3;
export const DEFAULT_MANIFEST_CLASS = 4;

// ─── Düşük seviye yardımcılar (birim testleri de kullanır) ─────────────────────

/** AES-256-CBC, IV = 0. padding 'pkcs7' (Apple) | 'zero' (blok hizasına sıfırla doldur). */
export function encryptCbc(data: Buffer, key: Buffer, padding: 'pkcs7' | 'zero' = 'pkcs7'): Buffer {
  const c = crypto.createCipheriv('aes-256-cbc', key, ZERO_IV);
  if (padding === 'zero') {
    c.setAutoPadding(false);
    const padded = Buffer.alloc(Math.ceil(data.length / 16) * 16);
    data.copy(padded);
    return Buffer.concat([c.update(padded), c.final()]);
  }
  return Buffer.concat([c.update(data), c.final()]);
}

function tlv(tag: string, value: Buffer | number): Buffer {
  const v = typeof value === 'number' ? u32be(value) : value;
  const h = Buffer.alloc(8);
  h.write(tag, 0, 'latin1');
  h.writeUInt32BE(v.length, 4);
  return Buffer.concat([h, v]);
}

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

export interface KeybagSpec {
  salt: Buffer;
  iter: number;
  dpsl: Buffer | null;
  dpic: number | null;
  /** CLAS → { wrap, wpky } */
  classes: Array<{ clas: number; wrap: number; ktyp?: number; wpky: Buffer }>;
}

/** Gerçek backup keybag düzeninde TLV üretir (VERS, TYPE, UUID, HMCK, WRAP, SALT, ITER, DPWT, DPIC, DPSL, sınıf blokları). */
export function buildKeybagTlv(spec: KeybagSpec): Buffer {
  const parts: Buffer[] = [
    tlv('VERS', 4),
    tlv('TYPE', 1), // backup keybag
    tlv('UUID', crypto.randomBytes(16)),
    tlv('HMCK', crypto.randomBytes(40)),
    tlv('WRAP', 0),
    tlv('SALT', spec.salt),
    tlv('ITER', spec.iter),
  ];
  if (spec.dpsl && spec.dpic !== null) {
    parts.push(tlv('DPWT', 1), tlv('DPIC', spec.dpic), tlv('DPSL', spec.dpsl));
  }
  for (const c of spec.classes) {
    parts.push(
      tlv('UUID', crypto.randomBytes(16)),
      tlv('CLAS', c.clas),
      tlv('WRAP', c.wrap),
      tlv('KTYP', c.ktyp ?? 0),
      tlv('WPKY', c.wpky),
    );
  }
  return Buffer.concat(parts);
}

/** iOS 10.2+ parola anahtarı (PBKDF2-SHA256 DPIC tur → PBKDF2-SHA1 ITER tur). */
export function derivePasscodeKeySync(
  password: string,
  spec: Pick<KeybagSpec, 'salt' | 'iter' | 'dpsl' | 'dpic'>,
): Buffer {
  if (spec.dpsl && spec.dpic !== null) {
    const k1 = crypto.pbkdf2Sync(password, spec.dpsl, spec.dpic, 32, 'sha256');
    return crypto.pbkdf2Sync(k1, spec.salt, spec.iter, 32, 'sha1');
  }
  return crypto.pbkdf2Sync(password, spec.salt, spec.iter, 32, 'sha1');
}

export interface MbFileSpec {
  relativePath: string;
  protectionClass: number;
  size: number;
  /** 44 bayt NS.data (4 bayt LE sınıf + 40 bayt sarılı anahtar) veya null (şifresiz kayıt). */
  encryptionKeyData: Buffer | null;
  mode?: number;
  lastModified?: number;
  inode?: number;
}

/** Gerçek yapıya yakın NSKeyedArchiver MBFile blob'u. */
export function buildMbFileBlob(spec: MbFileSpec): Buffer {
  const now = spec.lastModified ?? 1715265120;
  const objects: WritableValue[] = ['$null'];
  const mb: { [k: string]: WritableValue } = {
    LastModified: now,
    Flags: 0,
    GroupID: 501,
    LastStatusChange: now,
    Birth: now,
    $class: new PlistUid(0), // aşağıda düzeltilir
    RelativePath: new PlistUid(2),
    ProtectionClass: spec.protectionClass,
    Size: spec.size,
    Mode: spec.mode ?? 0o100644,
    UserID: 501,
    InodeNumber: spec.inode ?? 123456,
  };
  objects.push(mb); // 1
  objects.push(spec.relativePath); // 2
  if (spec.encryptionKeyData) {
    mb['EncryptionKey'] = new PlistUid(3);
    objects.push({ 'NS.data': spec.encryptionKeyData, $class: new PlistUid(4) }); // 3
    objects.push({
      $classname: 'NSMutableData',
      $classes: ['NSMutableData', 'NSData', 'NSObject'],
    }); // 4
  }
  mb['$class'] = new PlistUid(objects.length);
  objects.push({ $classname: 'MBFile', $classes: ['MBFile', 'NSObject'] });
  return writeBplist({
    $version: 100000,
    $archiver: 'NSKeyedArchiver',
    $top: { root: new PlistUid(1) },
    $objects: objects,
  });
}

// ─── Fixture ───────────────────────────────────────────────────────────────────

export interface EncryptBackupFixtureOptions {
  /** Düz yedek klasörü (<root>/<udid>) — Info.plist + Manifest.plist + <xx>/<fileId>. */
  plainDir: string;
  /** Şifreli yedeğin yazılacağı klasör (yeni <root>/<udid>). */
  outDir: string;
  password: string;
  files: Array<{ domain: string; relativePath: string; protectionClass?: number }>;
  /** DPIC ve ITER (varsayılan 10/10). */
  iterations?: number;
  manifestClass?: number;
}

export interface EncryptedFixtureFile {
  fileId: string;
  domain: string;
  relativePath: string;
  protectionClass: number;
  size: number;
  fileKey: Buffer;
  /** MBFile blob'u (Manifest.db Files.file ile aynı) */
  blob: Buffer;
}

export interface EncryptBackupFixtureResult {
  passcodeKey: Buffer;
  classKeys: Map<number, Buffer>;
  manifestDbKey: Buffer;
  files: EncryptedFixtureFile[];
}

export function encryptBackupFixture(
  opts: EncryptBackupFixtureOptions,
): EncryptBackupFixtureResult {
  const { plainDir, outDir, password } = opts;
  const iterations = opts.iterations ?? 10;
  const manifestClass = opts.manifestClass ?? DEFAULT_MANIFEST_CLASS;
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of ['Info.plist', 'Status.plist']) {
    const p = path.join(plainDir, name);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(outDir, name));
  }

  // Keybag + sınıf anahtarları
  const spec: Omit<KeybagSpec, 'classes'> = {
    salt: crypto.randomBytes(20),
    iter: iterations,
    dpsl: crypto.randomBytes(20),
    dpic: iterations,
  };
  const passcodeKey = derivePasscodeKeySync(password, spec);
  const classKeys = new Map<number, Buffer>();
  const classes: KeybagSpec['classes'] = [];
  for (const clas of FIXTURE_CLASSES) {
    const k = crypto.randomBytes(32);
    classKeys.set(clas, k);
    classes.push({ clas, wrap: 2, ktyp: 0, wpky: aesWrap(passcodeKey, k) });
  }
  const keybag = buildKeybagTlv({ ...spec, classes });

  const classKeyOf = (clas: number): Buffer => {
    const k = classKeys.get(clas);
    if (!k) throw new Error(`fixture: sınıf ${clas} yok`);
    return k;
  };

  // Dosyalar
  const rows: Array<{
    fileID: string;
    domain: string;
    relativePath: string;
    flags: number;
    file: Buffer;
  }> = [];
  const dirsSeen = new Set<string>();
  const out: EncryptedFixtureFile[] = [];
  let inode = 1000;
  for (const f of opts.files) {
    const fileId = computeFileId(f.domain, f.relativePath);
    const plainAbs = path.join(plainDir, fileId.slice(0, 2), fileId);
    const data = fs.readFileSync(plainAbs);
    const clas = f.protectionClass ?? DEFAULT_FILE_CLASS;
    const fileKey = crypto.randomBytes(32);
    const nsData = Buffer.concat([u32le(clas), aesWrap(classKeyOf(clas), fileKey)]);
    const encAbs = path.join(outDir, fileId.slice(0, 2), fileId);
    fs.mkdirSync(path.dirname(encAbs), { recursive: true });
    fs.writeFileSync(encAbs, encryptCbc(data, fileKey));
    const blob = buildMbFileBlob({
      relativePath: f.relativePath,
      protectionClass: clas,
      size: data.length,
      encryptionKeyData: nsData,
      inode: inode++,
    });
    rows.push({
      fileID: fileId,
      domain: f.domain,
      relativePath: f.relativePath,
      flags: 1,
      file: blob,
    });
    out.push({
      fileId,
      domain: f.domain,
      relativePath: f.relativePath,
      protectionClass: clas,
      size: data.length,
      fileKey,
      blob,
    });

    // Üst dizin kayıtları (flags=2, EncryptionKey yok) — gerçek Manifest.db'deki gibi
    const segs = f.relativePath.split('/').slice(0, -1);
    for (let i = 1; i <= segs.length; i++) {
      const dir = segs.slice(0, i).join('/');
      const key = `${f.domain}-${dir}`;
      if (dirsSeen.has(key)) continue;
      dirsSeen.add(key);
      rows.push({
        fileID: computeFileId(f.domain, dir),
        domain: f.domain,
        relativePath: dir,
        flags: 2,
        file: buildMbFileBlob({
          relativePath: dir,
          protectionClass: 0,
          size: 0,
          encryptionKeyData: null,
          mode: 0o40755,
          inode: inode++,
        }),
      });
    }
  }

  // Manifest.db (düz → şifreli)
  const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'afv-encfx-')), 'Manifest.db');
  const db = new Database(tmpDb);
  db.exec(`
    CREATE TABLE Files (fileID TEXT PRIMARY KEY, domain TEXT, relativePath TEXT, flags INTEGER, file BLOB);
    CREATE INDEX FilesDomainIdx ON Files(domain);
    CREATE INDEX FilesRelativePathIdx ON Files(relativePath);
    CREATE INDEX FilesFlagsIdx ON Files(flags);
    CREATE TABLE Properties (key TEXT PRIMARY KEY, value BLOB);
  `);
  const ins = db.prepare(
    'INSERT INTO Files (fileID, domain, relativePath, flags, file) VALUES (?,?,?,?,?)',
  );
  db.transaction(() => {
    for (const r of rows) ins.run(r.fileID, r.domain, r.relativePath, r.flags, r.file);
  })();
  db.prepare('INSERT INTO Properties (key, value) VALUES (?, ?)').run(
    'salt',
    crypto.randomBytes(20),
  );
  db.close();
  const manifestDbKey = crypto.randomBytes(32);
  fs.writeFileSync(
    path.join(outDir, 'Manifest.db'),
    encryptCbc(fs.readFileSync(tmpDb), manifestDbKey),
  );
  fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true });

  // Manifest.plist (binary, gerçek yedekteki gibi)
  let base: Record<string, WritableValue> = {};
  const plainManifest = path.join(plainDir, 'Manifest.plist');
  if (fs.existsSync(plainManifest)) {
    base = plist.parse(fs.readFileSync(plainManifest, 'utf8')) as Record<string, WritableValue>;
  }
  const manifestKey = Buffer.concat([
    u32le(manifestClass),
    aesWrap(classKeyOf(manifestClass), manifestDbKey),
  ]);
  fs.writeFileSync(
    path.join(outDir, 'Manifest.plist'),
    writeBplist({
      ...base,
      IsEncrypted: true,
      WasPasscodeSet: true,
      BackupKeyBag: keybag,
      ManifestKey: manifestKey,
    }),
  );

  return { passcodeKey, classKeys, manifestDbKey, files: out };
}
