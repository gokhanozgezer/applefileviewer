import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as safeFs from '@main/safeFs';
import {
  aesUnwrap,
  aesWrap,
  parseKeybag,
  unlockKeybag,
  parseFileRecord,
  openEncryptedBackup,
  pkcs7PadLength,
  WrongPasswordError,
  KeyUnwrapError,
  DecryptError,
  MissingClassKeyError,
  SessionDisposedError,
  EncryptedBackupFormatError,
  type FileRecord,
} from '@main/modules/crypto';
import { parseBplist, PlistUid, BplistFormatError } from '@main/util/bplist';
import { getTmpRoot } from '../../setup';
import {
  buildKeybagTlv,
  buildMbFileBlob,
  derivePasscodeKeySync,
  encryptBackupFixture,
  encryptCbc,
} from './encryptedBackupFixture';
import { writeBplist } from './bplistWriter';

const hex = (s: string): Buffer => Buffer.from(s.replace(/\s+/g, ''), 'hex');
const PASSWORD = 'test-parola-123';

describe('aesKeyWrap (RFC 3394)', () => {
  // RFC 3394 §4.6 — 256-bit KEK ile 256-bit anahtar sarma
  const KEK = hex('000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F');
  const KEY = hex('00112233445566778899AABBCCDDEEFF000102030405060708090A0B0C0D0E0F');
  const WRAPPED = hex(
    '28C9F404C4B810F4 CBCCB35CFB87F826 3F5786E2D80ED326 CBC7F0E71A99F43B FB988B9B7A02DD21',
  );

  it('§4.6 vektörü: wrap', () => {
    expect(aesWrap(KEK, KEY).equals(WRAPPED)).toBe(true);
  });

  it('§4.6 vektörü: unwrap', () => {
    expect(aesUnwrap(KEK, WRAPPED).equals(KEY)).toBe(true);
  });

  it('§4.1 vektörü (128-bit KEK, 128-bit anahtar)', () => {
    const kek = hex('000102030405060708090A0B0C0D0E0F');
    const key = hex('00112233445566778899AABBCCDDEEFF');
    const wrapped = hex('1FA68B0A8112B447 AEF34BD8FB5A7B82 9D3E862371D2CFE5');
    expect(aesWrap(kek, key).equals(wrapped)).toBe(true);
    expect(aesUnwrap(kek, wrapped).equals(key)).toBe(true);
  });

  it('yanlış KEK → KeyUnwrapError', () => {
    const bad = Buffer.from(KEK);
    bad[0] = (bad[0] as number) ^ 1;
    expect(() => aesUnwrap(bad, WRAPPED)).toThrow(KeyUnwrapError);
  });

  it('geçersiz uzunluk → RangeError', () => {
    expect(() => aesUnwrap(KEK, Buffer.alloc(20))).toThrow(RangeError);
    expect(() => aesUnwrap(Buffer.alloc(10), WRAPPED)).toThrow(RangeError);
  });
});

describe('keybag', () => {
  function makeKeybag(password: string) {
    const spec = {
      salt: crypto.randomBytes(20),
      iter: 7,
      dpsl: crypto.randomBytes(20),
      dpic: 9,
    };
    const pk = derivePasscodeKeySync(password, spec);
    const k1 = crypto.randomBytes(32);
    const k3 = crypto.randomBytes(32);
    const buf = buildKeybagTlv({
      ...spec,
      classes: [
        { clas: 1, wrap: 2, ktyp: 0, wpky: aesWrap(pk, k1) },
        { clas: 3, wrap: 3, ktyp: 1, wpky: aesWrap(pk, k3) },
        // cihaz-sarılı (WRAP=1) — yedekte çözülemez, atlanmalı
        { clas: 5, wrap: 1, wpky: crypto.randomBytes(40) },
      ],
    });
    return { spec, buf, k1, k3 };
  }

  it('TLV başlık + sınıf bloklarını parse eder', () => {
    const { spec, buf } = makeKeybag(PASSWORD);
    const kb = parseKeybag(buf);
    expect(kb.version).toBe(4);
    expect(kb.type).toBe(1);
    expect(kb.uuid?.length).toBe(16);
    expect(kb.wrap).toBe(0);
    expect(kb.iter).toBe(7);
    expect(kb.dpic).toBe(9);
    expect(kb.dpwt).toBe(1);
    expect(kb.salt?.equals(spec.salt)).toBe(true);
    expect(kb.dpsl?.equals(spec.dpsl)).toBe(true);
    expect(kb.attrs.get('HMCK')?.length).toBe(40);
    expect([...kb.classKeys.keys()]).toEqual([1, 3, 5]);
    expect(kb.classKeys.get(3)).toMatchObject({ clas: 3, wrap: 3, ktyp: 1 });
    expect(kb.classKeys.get(1)?.wpky?.length).toBe(40);
  });

  it('doğru parola → sınıf anahtarları; cihaz-sarılı atlanır', async () => {
    const { buf, k1, k3 } = makeKeybag(PASSWORD);
    const keys = await unlockKeybag(parseKeybag(buf), PASSWORD);
    expect(keys.get(1)?.equals(k1)).toBe(true);
    expect(keys.get(3)?.equals(k3)).toBe(true);
    expect(keys.has(5)).toBe(false);
  });

  it('yanlış parola → WrongPasswordError', async () => {
    const { buf } = makeKeybag(PASSWORD);
    await expect(unlockKeybag(parseKeybag(buf), 'yanlis')).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it('DPSL/DPIC yoksa (iOS < 10.2) tek tur SHA1 PBKDF2', async () => {
    const spec = { salt: crypto.randomBytes(20), iter: 5, dpsl: null, dpic: null };
    const pk = derivePasscodeKeySync(PASSWORD, spec);
    const k = crypto.randomBytes(32);
    const buf = buildKeybagTlv({ ...spec, classes: [{ clas: 2, wrap: 2, wpky: aesWrap(pk, k) }] });
    const keys = await unlockKeybag(parseKeybag(buf), PASSWORD);
    expect(keys.get(2)?.equals(k)).toBe(true);
  });

  it('kötü niyetli iterasyon / bozuk TLV → EncryptedBackupFormatError', async () => {
    const buf = buildKeybagTlv({
      salt: crypto.randomBytes(20),
      iter: 5,
      dpsl: crypto.randomBytes(20),
      dpic: 50_000_000,
      classes: [{ clas: 1, wrap: 2, wpky: crypto.randomBytes(40) }],
    });
    await expect(unlockKeybag(parseKeybag(buf), PASSWORD)).rejects.toBeInstanceOf(
      EncryptedBackupFormatError,
    );
    const truncated = Buffer.concat([
      Buffer.from('SALT', 'latin1'),
      hex('00000050'),
      Buffer.alloc(4),
    ]);
    expect(() => parseKeybag(truncated)).toThrow(EncryptedBackupFormatError);
  });
});

describe('bplist + NSKeyedArchiver MBFile', () => {
  it('UID, 64-bit int, utf16, data, date round-trip', () => {
    const big = 5_000_000_000; // > 32-bit
    const d = new Date('2024-05-09T14:32:00Z');
    const v = parseBplist(
      writeBplist({
        u: new PlistUid(7),
        n: big,
        neg: -3,
        s: 'Gökhan',
        b: Buffer.from([1, 2]),
        d,
        t: true,
      }),
    ) as Record<string, unknown>;
    expect(v['u']).toBeInstanceOf(PlistUid);
    expect((v['u'] as PlistUid).uid).toBe(7);
    expect(v['n']).toBe(big);
    expect(v['neg']).toBe(-3);
    expect(v['s']).toBe('Gökhan');
    expect(v['b']).toEqual(Buffer.from([1, 2]));
    expect((v['d'] as Date).toISOString()).toBe(d.toISOString());
    expect(v['t']).toBe(true);
  });

  it('bozuk bplist → BplistFormatError', () => {
    expect(() => parseBplist(Buffer.from('bplist00garbage-garbage-garbage-garbage-xx'))).toThrow(
      BplistFormatError,
    );
  });

  it('MBFile: ProtectionClass, Size (>4 GB), EncryptionKey NS.data[4:]', () => {
    const wrapped = crypto.randomBytes(40);
    const nsData = Buffer.concat([hex('03000000'), wrapped]);
    const blob = buildMbFileBlob({
      relativePath: 'Media/DCIM/100APPLE/IMG_0001.MOV',
      protectionClass: 3,
      size: 6_000_000_000,
      encryptionKeyData: nsData,
    });
    // Gerçek yapı: $archiver/$version/$top.root UID/$objects[0] = '$null'
    const top = parseBplist(blob) as Record<string, unknown>;
    expect(top['$archiver']).toBe('NSKeyedArchiver');
    expect(top['$version']).toBe(100000);
    expect((top['$objects'] as unknown[])[0]).toBe('$null');
    const rec = parseFileRecord(blob);
    expect(rec.protectionClass).toBe(3);
    expect(rec.size).toBe(6_000_000_000);
    expect(rec.wrappedKey?.equals(wrapped)).toBe(true);
  });

  it('EncryptionKey yok → wrappedKey null (dizin/şifresiz)', () => {
    const rec = parseFileRecord(
      buildMbFileBlob({
        relativePath: 'Library',
        protectionClass: 0,
        size: 0,
        encryptionKeyData: null,
      }),
    );
    expect(rec).toEqual({ protectionClass: 0, size: 0, wrappedKey: null });
  });

  it('bozuk blob → EncryptedBackupFormatError', () => {
    expect(() => parseFileRecord(Buffer.from('xx'))).toThrow(EncryptedBackupFormatError);
  });
});

describe('pkcs7PadLength', () => {
  it('geçerli / geçersiz', () => {
    const b = Buffer.alloc(16, 0x41);
    b.fill(4, 12);
    expect(pkcs7PadLength(b)).toBe(4);
    expect(pkcs7PadLength(Buffer.alloc(16, 16))).toBe(16);
    expect(pkcs7PadLength(Buffer.alloc(16, 0))).toBeNull();
    b[13] = 5;
    expect(pkcs7PadLength(b)).toBeNull();
  });
});

describe('openEncryptedBackup', () => {
  const DOMAIN = 'HomeDomain';
  let plainDir: string;
  let encDir: string;
  let outDir: string;

  function writePlain(domain: string, rel: string, data: Buffer): void {
    const id = crypto.createHash('sha1').update(`${domain}-${rel}`).digest('hex');
    const p = path.join(plainDir, id.slice(0, 2), id);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  }

  beforeEach(() => {
    plainDir = path.join(getTmpRoot(), 'plain', 'udid1');
    encDir = path.join(getTmpRoot(), 'enc', 'udid1');
    outDir = path.join(getTmpRoot(), 'out');
    fs.mkdirSync(plainDir, { recursive: true });
    fs.writeFileSync(
      path.join(plainDir, 'Manifest.plist'),
      '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>IsEncrypted</key><false/><key>Version</key><string>10.0</string></dict></plist>',
    );
    fs.writeFileSync(path.join(plainDir, 'Info.plist'), '<plist version="1.0"><dict/></plist>');
    safeFs._resetProtectedRootsForTest();
  });

  afterEach(() => {
    safeFs._resetProtectedRootsForTest();
  });

  it('yanlış parola → WrongPasswordError', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('x'));
    encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    await expect(openEncryptedBackup(encDir, 'nope')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('şifresiz yedek → EncryptedBackupFormatError', async () => {
    await expect(openEncryptedBackup(plainDir, PASSWORD)).rejects.toBeInstanceOf(
      EncryptedBackupFormatError,
    );
  });

  it('Manifest.db çözümü: Files tablosu + blob parse + dosya çözümü (tam uzunluk, PKCS7)', async () => {
    const sizes = [0, 1, 15, 16, 17, 4096];
    const files = sizes.map((n) => ({ domain: DOMAIN, relativePath: `Library/t/f${n}.bin` }));
    const plain = new Map<string, Buffer>();
    for (const [i, n] of sizes.entries()) {
      const data = crypto.randomBytes(n);
      plain.set(files[i]!.relativePath, data);
      writePlain(DOMAIN, files[i]!.relativePath, data);
    }
    const fx = encryptBackupFixture({ plainDir, outDir: encDir, password: PASSWORD, files });
    safeFs.setBackupRoot(encDir); // gerçek kullanımdaki gibi yedek kökü korunur

    const s = await openEncryptedBackup(encDir, PASSWORD);
    expect(s.manifestEncrypted).toBe(true);
    const dbOut = path.join(outDir, 'Manifest.db');
    await s.decryptManifestDb(dbOut);
    expect(fs.readFileSync(dbOut).subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0');

    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbOut, { readonly: true });
    const rows = db
      .prepare('SELECT fileID, relativePath, flags, file FROM Files WHERE flags = 1')
      .all() as Array<{ fileID: string; relativePath: string; flags: number; file: Buffer }>;
    const dirs = db.prepare('SELECT relativePath, file FROM Files WHERE flags = 2').all() as Array<{
      relativePath: string;
      file: Buffer;
    }>;
    db.close();
    expect(rows).toHaveLength(sizes.length);
    expect(dirs.map((d) => d.relativePath).sort()).toEqual(['Library', 'Library/t']);
    expect(s.parseFileRecord(dirs[0]!.file).wrappedKey).toBeNull();

    for (const r of rows) {
      const rec = s.parseFileRecord(r.file);
      const fxf = fx.files.find((f) => f.fileId === r.fileID)!;
      expect(rec.protectionClass).toBe(3);
      expect(s.fileKey(rec)?.equals(fxf.fileKey)).toBe(true);
      const out = path.join(outDir, r.fileID);
      await s.decryptFileTo(path.join(encDir, r.fileID.slice(0, 2), r.fileID), out, rec);
      expect(fs.readFileSync(out).equals(plain.get(r.relativePath)!)).toBe(true);
    }
    // Çıktı klasöründe .part artığı yok
    expect(fs.readdirSync(outDir).some((n) => n.endsWith('.part'))).toBe(false);
    s.dispose();
  });

  it('geçersiz padding → Size son blok içindeyse Size’a kesilir, değilse DecryptError', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('x'));
    const fx = encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    const key = crypto.randomBytes(32);
    const wrapped = aesWrap(fx.classKeys.get(3)!, key);
    const data = crypto.randomBytes(100);
    const inAbs = path.join(getTmpRoot(), 'zero.enc');
    fs.writeFileSync(inAbs, encryptCbc(data, key, 'zero')); // 112 bayt, sıfır dolgu

    const out = path.join(outDir, 'trunc.bin');
    await s.decryptFileTo(inAbs, out, { protectionClass: 3, size: 100, wrappedKey: wrapped });
    expect(fs.readFileSync(out).equals(data)).toBe(true);

    await expect(
      s.decryptFileTo(inAbs, path.join(outDir, 'bad.bin'), {
        protectionClass: 3,
        size: 50,
        wrappedKey: wrapped,
      }),
    ).rejects.toBeInstanceOf(DecryptError);
    await expect(
      s.decryptFileTo(inAbs, path.join(outDir, 'bad2.bin'), {
        protectionClass: 3,
        size: 0,
        wrappedKey: wrapped,
      }),
    ).rejects.toBeInstanceOf(DecryptError);
    expect(fs.readdirSync(outDir).sort()).toEqual(['trunc.bin']);

    // PKCS7 geçerliyse Size (canlı DB sapması) yok sayılır — referans davranışı
    const pk = path.join(getTmpRoot(), 'pk.enc');
    fs.writeFileSync(pk, encryptCbc(data, key));
    await s.decryptFileTo(pk, path.join(outDir, 'pk.bin'), {
      protectionClass: 3,
      size: 90,
      wrappedKey: wrapped,
    });
    expect(fs.readFileSync(path.join(outDir, 'pk.bin')).equals(data)).toBe(true);
    s.dispose();
  });

  it('çok MB’lık dosya akışlı çözülür', async () => {
    const big = crypto.randomBytes(5 * 1024 * 1024 + 7);
    writePlain(DOMAIN, 'Media/big.mov', big);
    const fx = encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'Media/big.mov' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    const f = fx.files[0]!;
    const rec = s.parseFileRecord(f.blob);
    expect(rec.size).toBe(big.length);
    const out = path.join(outDir, 'big.mov');
    await s.decryptFileTo(path.join(encDir, f.fileId.slice(0, 2), f.fileId), out, rec);
    const got = fs.readFileSync(out);
    expect(got.length).toBe(big.length);
    expect(got.equals(big)).toBe(true);
    s.dispose();
  });

  it('şifresiz kayıt (EncryptionKey yok) olduğu gibi kopyalanır', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('x'));
    encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    const src = path.join(getTmpRoot(), 'plain.bin');
    const data = crypto.randomBytes(1234);
    fs.writeFileSync(src, data);
    const rec: FileRecord = { protectionClass: 0, size: 1234, wrappedKey: null };
    expect(s.fileKey(rec)).toBeNull();
    await s.decryptFileTo(src, path.join(outDir, 'copy.bin'), rec);
    expect(fs.readFileSync(path.join(outDir, 'copy.bin')).equals(data)).toBe(true);
    s.dispose();
  });

  it('abort → yarım çıktı silinir, final dosya oluşmaz', async () => {
    const big = crypto.randomBytes(8 * 1024 * 1024);
    writePlain(DOMAIN, 'big.bin', big);
    const fx = encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'big.bin' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    const f = fx.files[0]!;
    const rec = s.parseFileRecord(f.blob);
    const out = path.join(outDir, 'big.bin');

    const ac = new AbortController();
    const p = s.decryptFileTo(
      path.join(encDir, f.fileId.slice(0, 2), f.fileId),
      out,
      rec,
      ac.signal,
    );
    setImmediate(() => ac.abort());
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(fs.existsSync(out)).toBe(false);
    expect(fs.existsSync(outDir) ? fs.readdirSync(outDir) : []).toEqual([]);

    // Önceden abort edilmiş sinyal → hiç dosya açılmaz
    await expect(
      s.decryptFileTo(
        path.join(encDir, f.fileId.slice(0, 2), f.fileId),
        out,
        rec,
        AbortSignal.abort(),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    s.dispose();
  });

  it('bozuk (hizasız) şifreli dosya → DecryptError, temizlik', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('hello'));
    const fx = encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    const bad = path.join(getTmpRoot(), 'bad.enc');
    fs.writeFileSync(bad, crypto.randomBytes(33));
    await expect(
      s.decryptFileTo(bad, path.join(outDir, 'x'), s.parseFileRecord(fx.files[0]!.blob)),
    ).rejects.toBeInstanceOf(DecryptError);
    s.dispose();
  });

  it('eksik sınıf anahtarı → MissingClassKeyError', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('x'));
    encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    expect(() =>
      s.fileKey({ protectionClass: 99, size: 1, wrappedKey: crypto.randomBytes(40) }),
    ).toThrow(MissingClassKeyError);
    s.dispose();
  });

  it('dispose: sınıf anahtarları sıfırlanır, sonraki kullanım SessionDisposedError', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('x'));
    const fx = encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    const s = await openEncryptedBackup(encDir, PASSWORD);
    const rec = s.parseFileRecord(fx.files[0]!.blob);
    const k = s.fileKey(rec);
    expect(k?.equals(fx.files[0]!.fileKey)).toBe(true);
    s.dispose();
    expect(s.disposed).toBe(true);
    expect(() => s.fileKey(rec)).toThrow(SessionDisposedError);
    await expect(s.decryptManifestDb(path.join(outDir, 'm.db'))).rejects.toBeInstanceOf(
      SessionDisposedError,
    );
    s.dispose(); // idempotent
  });

  it('çıktı yedek kökü altındaysa yazma reddedilir (safeFs gateway)', async () => {
    writePlain(DOMAIN, 'a.txt', Buffer.from('x'));
    encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [{ domain: DOMAIN, relativePath: 'a.txt' }],
    });
    safeFs.setBackupRoot(encDir);
    const s = await openEncryptedBackup(encDir, PASSWORD);
    await expect(s.decryptManifestDb(path.join(encDir, 'Manifest.dec.db'))).rejects.toBeInstanceOf(
      safeFs.BackupWriteForbiddenError,
    );
    expect(fs.readdirSync(encDir).some((n) => n.startsWith('Manifest.dec'))).toBe(false);
    s.dispose();
  });
});
