// Kilit açma / çözücü testleri için: düz fixture (sms.db + AddressBook + bir medya dosyası)
// → <root>/<udid> altında bayt-doğru ŞİFRELİ yedek. Küçük PBKDF2 tur sayısı (hız).
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES_ROOT } from '../../setup';
import { writeSmsFixture } from '../messages/messagesFixture';
import { writeContactsFixture } from '../contacts/contactsFixture';
import { encryptBackupFixture, type EncryptedFixtureFile } from '../crypto/encryptedBackupFixture';
import { computeFileId } from '@main/modules/manifest/fileId';

export const ENC_UDID = 'fedcba9876543210fedcba9876543210fedcba98';
export const ENC_PASSWORD = 'doğru-parola-ÇĞ';
const PLAIN_FIXTURE_UDID = 'abcdef0123456789abcdef0123456789abcdef01';

export const MEDIA_DOMAIN = 'MediaDomain';
export const MEDIA_REL = 'Library/SMS/Attachments/aa/01/photo.jpg';
export const MEDIA_FILE_ID = computeFileId(MEDIA_DOMAIN, MEDIA_REL);
/** Medya içeriği — çözülmüş dosyanın düz metinle aynı olduğu doğrulanır. */
export const MEDIA_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(70_000, 7), // birden çok 64K parça — akışlı çözüm
]);

export interface EncryptedFixture {
  rootPath: string;
  udid: string;
  backupDir: string;
  files: EncryptedFixtureFile[];
}

/** tmpRoot/plain → tmpRoot/enc/<udid> (rootPath = tmpRoot/enc). */
export function writeEncryptedSessionFixture(tmpRoot: string, udid = ENC_UDID): EncryptedFixture {
  const plainRoot = path.join(tmpRoot, 'plain');
  const plainDir = path.join(plainRoot, udid);
  fs.mkdirSync(plainDir, { recursive: true });
  for (const f of ['Info.plist', 'Manifest.plist']) {
    fs.copyFileSync(
      path.join(FIXTURES_ROOT, 'backups', PLAIN_FIXTURE_UDID, f),
      path.join(plainDir, f),
    );
  }
  writeSmsFixture(plainRoot, udid);
  writeContactsFixture(plainRoot, udid);
  const mediaAbs = path.join(plainDir, MEDIA_FILE_ID.slice(0, 2), MEDIA_FILE_ID);
  fs.mkdirSync(path.dirname(mediaAbs), { recursive: true });
  fs.writeFileSync(mediaAbs, MEDIA_BYTES);

  const rootPath = path.join(tmpRoot, 'enc');
  const backupDir = path.join(rootPath, udid);
  const res = encryptBackupFixture({
    plainDir,
    outDir: backupDir,
    password: ENC_PASSWORD,
    files: [
      { domain: 'HomeDomain', relativePath: 'Library/SMS/sms.db' },
      { domain: 'HomeDomain', relativePath: 'Library/AddressBook/AddressBook.sqlitedb' },
      { domain: MEDIA_DOMAIN, relativePath: MEDIA_REL },
    ],
  });
  return { rootPath, udid, backupDir, files: res.files };
}
