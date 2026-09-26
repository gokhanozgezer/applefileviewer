// Uçtan uca: düz fixture (sms.db + AddressBook) → şifreli yedek → openEncryptedBackup →
// Manifest.db + sms.db çözümü → better-sqlite3 ile satır okuma.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openEncryptedBackup, WrongPasswordError, FILE_FLAGS } from '@main/modules/crypto';
import { getTmpRoot, FIXTURES_ROOT } from '../../setup';
import { writeSmsFixture } from '../messages/messagesFixture';
import { writeContactsFixture } from '../contacts/contactsFixture';
import { encryptBackupFixture } from './encryptedBackupFixture';

const UDID = 'abcdef0123456789abcdef0123456789abcdef01';
const PASSWORD = 'şifre-ÇĞÜ-123'; // UTF-8 parola

describe('şifreli yedek round-trip', () => {
  it('Manifest.db + sms.db çözülür, satırlar okunur', async () => {
    const plainRoot = path.join(getTmpRoot(), 'plain');
    const plainDir = path.join(plainRoot, UDID);
    fs.mkdirSync(plainDir, { recursive: true });
    for (const f of ['Info.plist', 'Manifest.plist']) {
      fs.copyFileSync(path.join(FIXTURES_ROOT, 'backups', UDID, f), path.join(plainDir, f));
    }
    writeSmsFixture(plainRoot, UDID);
    writeContactsFixture(plainRoot, UDID);

    const encDir = path.join(getTmpRoot(), 'enc', UDID);
    encryptBackupFixture({
      plainDir,
      outDir: encDir,
      password: PASSWORD,
      files: [
        { domain: 'HomeDomain', relativePath: 'Library/SMS/sms.db' },
        { domain: 'HomeDomain', relativePath: 'Library/AddressBook/AddressBook.sqlitedb' },
      ],
    });
    expect(fs.existsSync(path.join(encDir, 'Info.plist'))).toBe(true);
    // Şifreli dosya düz SQLite değil
    const encSms = fs.readFileSync(
      path.join(encDir, '3d', '3d0d7e5fb2ce288813306e4d4636395e047a3d28'),
    );
    expect(encSms.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');

    await expect(openEncryptedBackup(encDir, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);

    const session = await openEncryptedBackup(encDir, PASSWORD);
    const work = path.join(getTmpRoot(), 'work');
    const manifestOut = path.join(work, 'Manifest.db');
    await session.decryptManifestDb(manifestOut);

    const mdb = new Database(manifestOut, { readonly: true });
    const row = mdb
      .prepare('SELECT fileID, flags, file FROM Files WHERE domain = ? AND relativePath = ?')
      .get('HomeDomain', 'Library/SMS/sms.db') as { fileID: string; flags: number; file: Buffer };
    mdb.close();
    expect(row.fileID).toBe('3d0d7e5fb2ce288813306e4d4636395e047a3d28');
    expect(row.flags).toBe(FILE_FLAGS.FILE);

    const rec = session.parseFileRecord(row.file);
    const smsOut = path.join(work, 'sms.db');
    await session.decryptFileTo(path.join(encDir, row.fileID.slice(0, 2), row.fileID), smsOut, rec);
    expect(fs.statSync(smsOut).size).toBe(rec.size);

    const sms = new Database(smsOut, { readonly: true });
    const msgs = sms.prepare('SELECT ROWID, text FROM message ORDER BY ROWID').all() as Array<{
      ROWID: number;
      text: string;
    }>;
    sms.close();
    expect(msgs.length).toBeGreaterThanOrEqual(5);
    expect(msgs[0]).toEqual({ ROWID: 100, text: 'Merhaba' });

    session.dispose();
  });
});
