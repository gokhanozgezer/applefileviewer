// E2E sentetik yedek üreticisi — birim testlerin fixture yazıcılarını tek bir
// yedek klasöründe birleştirir. better-sqlite3 Electron ABI'de olduğundan
// Playwright'ın Node'unda değil, Electron-Node + vite-node altında koşar
// (bkz. tests/e2e-support/globalSetup.ts). Kullanım: vite-node buildBackup.ts <backupParentDir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeSmsFixture } from '../modules/messages/messagesFixture';
import { writeContactsFixture } from '../modules/contacts/contactsFixture';
import { writeCallsFixture } from '../modules/calls/callsFixture';
import { writeNotesFixture } from '../modules/notes/notesFixture';
import { writeVoicemailFixture } from '../modules/voicemail/voicemailFixture';
import { writeVoiceMemosFixture } from '../modules/voicememos/voiceMemosFixture';
import { writeWhatsAppFixture } from '../modules/whatsapp/whatsappFixture';
import { encryptBackupFixture } from '../modules/crypto/encryptedBackupFixture';
import { localizeDemoBackup } from './demoLocale';
import Database from 'better-sqlite3';
import { computeFileId } from '../../src/main/modules/manifest/fileId';

export const E2E_UDID = 'abcdef0123456789abcdef0123456789abcdef01';
/** İkinci (ŞİFRELİ) yedek — e2e/encrypted.spec.ts ile aynı sabitler. */
export const E2E_ENC_UDID = 'fedcba9876543210fedcba9876543210fedcba98';
export const E2E_ENC_PASSWORD = 'e2e-parola-Ş1';
export const E2E_ENC_DEVICE_NAME = 'Encrypted iPhone';

const parent = process.argv[2];
if (!parent) {
  console.error('kullanım: buildBackup.ts <backupParentDir>');
  process.exit(1);
}

const src = path.resolve(__dirname, '..', 'fixtures', 'backups', E2E_UDID);
const dst = path.join(parent, E2E_UDID);
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));

// AddressBook'u yalnızca contacts fixture'ı yazar (diğer modüllerin kişi eşlemesi de onu okur).
writeContactsFixture(parent, E2E_UDID);
writeSmsFixture(parent, E2E_UDID);
writeCallsFixture(parent, E2E_UDID);
writeNotesFixture(parent, E2E_UDID);
writeVoicemailFixture(parent, E2E_UDID);
writeVoiceMemosFixture(parent, E2E_UDID);
writeWhatsAppFixture(parent, E2E_UDID);
writePhotosFixture(parent, E2E_UDID);
// Demo İngilizce arayüzle gösteriliyor (site/README ekran görüntüleri) — içerik de İngilizce.
localizeDemoBackup(parent, E2E_UDID);

console.log(`[e2e] sentetik yedek hazır: ${dst}`);

writeEncryptedBackup(parent);

/**
 * Aynı fixture verisiyle ikinci, ŞİFRELİ yedek (farklı udid + "Encrypted iPhone" cihaz adı).
 * Düz kopya geçici klasörde üretilir, encryptBackupFixture ile bayt-doğru şifreli yedeğe
 * çevrilir (küçük PBKDF2 turu — hız), geçici düz kopya silinir. İlk yedeğe dokunulmaz.
 */
function writeEncryptedBackup(parentDir: string): void {
  const plainRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'afv-e2e-plain-'));
  try {
    const plainDir = path.join(plainRoot, E2E_ENC_UDID);
    fs.mkdirSync(plainDir, { recursive: true });
    for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(plainDir, f));
    const infoPath = path.join(plainDir, 'Info.plist');
    fs.writeFileSync(
      infoPath,
      fs.readFileSync(infoPath, 'utf8').replace(/Test iPhone/g, E2E_ENC_DEVICE_NAME),
    );
    writeContactsFixture(plainRoot, E2E_ENC_UDID);
    writeSmsFixture(plainRoot, E2E_ENC_UDID);
    writeCallsFixture(plainRoot, E2E_ENC_UDID);
    writeNotesFixture(plainRoot, E2E_ENC_UDID);
    writeVoicemailFixture(plainRoot, E2E_ENC_UDID);
    writeVoiceMemosFixture(plainRoot, E2E_ENC_UDID);
    writeWhatsAppFixture(plainRoot, E2E_ENC_UDID);
    writePhotosFixture(plainRoot, E2E_ENC_UDID);
    localizeDemoBackup(plainRoot, E2E_ENC_UDID);

    const candidates: Array<{ domain: string; relativePath: string }> = [
      { domain: 'HomeDomain', relativePath: 'Library/SMS/sms.db' },
      { domain: 'HomeDomain', relativePath: 'Library/AddressBook/AddressBook.sqlitedb' },
      { domain: 'HomeDomain', relativePath: 'Library/CallHistoryDB/CallHistory.storedata' },
      { domain: 'HomeDomain', relativePath: 'Library/Voicemail/voicemail.db' },
      { domain: 'AppDomainGroup-group.com.apple.notes', relativePath: 'NoteStore.sqlite' },
      {
        domain: 'AppDomainGroup-group.com.apple.VoiceMemos.shared',
        relativePath: 'Recordings/CloudRecordings.db',
      },
      {
        domain: 'AppDomainGroup-group.net.whatsapp.WhatsApp.shared',
        relativePath: 'ChatStorage.sqlite',
      },
      { domain: 'CameraRollDomain', relativePath: 'Media/PhotoData/Photos.sqlite' },
    ];
    const files = candidates.filter((c) => {
      const id = computeFileId(c.domain, c.relativePath);
      return fs.existsSync(path.join(plainDir, id.slice(0, 2), id));
    });

    const outDir = path.join(parentDir, E2E_ENC_UDID);
    fs.rmSync(outDir, { recursive: true, force: true });
    encryptBackupFixture({ plainDir, outDir, password: E2E_ENC_PASSWORD, files, iterations: 10 });
    console.log(`[e2e] şifreli yedek hazır (${files.length} dosya): ${outDir}`);
  } finally {
    fs.rmSync(plainRoot, { recursive: true, force: true });
  }
}

/** Gerçek şemaya yakın minimal Photos.sqlite (listPhotos + albüm keşfi için yeterli kolonlar). */
function writePhotosFixture(rootPath: string, udid: string): void {
  const fid = computeFileId('CameraRollDomain', 'Media/PhotoData/Photos.sqlite');
  const dir = path.join(rootPath, udid, fid.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, fid));
  db.exec(`
    CREATE TABLE ZASSET (
      Z_PK INTEGER PRIMARY KEY,
      ZDIRECTORY TEXT, ZFILENAME TEXT, ZDATECREATED REAL,
      ZFAVORITE INTEGER, ZHIDDEN INTEGER, ZKIND INTEGER, ZTRASHEDSTATE INTEGER,
      ZWIDTH INTEGER, ZHEIGHT INTEGER, ZDURATION REAL, ZUNIFORMTYPEIDENTIFIER TEXT
    );
  `);
  const ins = db.prepare(`INSERT INTO ZASSET
    (ZDIRECTORY, ZFILENAME, ZDATECREATED, ZFAVORITE, ZHIDDEN, ZKIND, ZTRASHEDSTATE, ZWIDTH, ZHEIGHT, ZDURATION, ZUNIFORMTYPEIDENTIFIER)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('DCIM/100APPLE', 'IMG_0001.HEIC', 799850629, 1, 0, 0, 0, 4032, 3024, null, 'public.heic');
  ins.run(
    'DCIM/100APPLE',
    'IMG_0002.MOV',
    799777697,
    0,
    0,
    1,
    0,
    1920,
    1080,
    12.5,
    'com.apple.quicktime-movie',
  );
  ins.run('DCIM/100APPLE', 'IMG_0003.JPG', 790000000, 0, 0, 0, 0, 3024, 4032, null, 'public.jpeg');
  db.close();
}
