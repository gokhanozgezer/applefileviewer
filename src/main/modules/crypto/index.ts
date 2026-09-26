// modules/crypto — şifreli iTunes/Finder iPhone yedeklerini okuma çekirdeği (iOS 10.2+,
// daha eskiler için tek-tur PBKDF2 + şifresiz Manifest.db geri dönüşü). SAF modül:
// IPC/UI/protocol entegrasyonu yok; fs yazımı safeFs *Out gateway'lerinden geçer
// (korunan yedek köklerine yazılamaz).
//
// Referans semantik: jsharkey13/iphone_backup_decrypt (utils.py: BackupKeyBag,
// FilePlist, aes_decrypt_chunked) + iphone-dataprotection keybag.py.
//
// ─── API ─────────────────────────────────────────────────────────────────────
//   parseKeybag(buf): Keybag                         — TLV (etiket + BE uzunluk)
//   unlockKeybag(kb, password): Promise<Map<clas, key>> — WrongPasswordError
//   aesUnwrap(kek, wrapped): Buffer                   — RFC 3394 (KeyUnwrapError)
//   aesWrap(kek, key): Buffer                         — RFC 3394 (fixture/test)
//   parseFileRecord(blob): FileRecord                 — NSKeyedArchiver MBFile
//   openEncryptedBackup(backupDir, password): Promise<EncryptedBackupSession>
//     .decryptManifestDb(outAbs, signal?)             — tüm dosya AES-256-CBC, IV=0
//     .parseFileRecord(blob)                          — { protectionClass, size, wrappedKey }
//     .fileKey(record): Buffer | null                 — çağıran sahiplenir (fill(0))
//     .decryptFileTo(inAbs, outAbs, record, signal?)  — akışlı, atomik, abort'ta temizlik
//     .dispose()                                      — anahtarları sıfırlar
//
// ─── Format kararları ────────────────────────────────────────────────────────
//   - ManifestKey: 4 bayt LITTLE-endian sınıf + 40 bayt sarılı anahtar.
//   - Sınıf anahtarları: yalnız WRAP & 2 (parola-sarılı) çözülür; herhangi birinde
//     unwrap bütünlük hatası ⇒ WrongPasswordError.
//   - Dosya sınıfı MBFile.ProtectionClass'tan; sarılı anahtar EncryptionKey.NS.data[4:].
//   - Padding: geçerli PKCS7 soyulur (Size'a güvenilmez — canlı DB'lerde sapar);
//     geçersiz padding'de Size son blok içindeyse Size'a kesilir, değilse DecryptError.
//     Manifest.db: geçerli PKCS7 soyulur, geçersizse olduğu gibi (SQLite başlığı doğrulanır).
//   - Files.flags: 1 = dosya, 2 = dizin, 4 = symlink (FILE_FLAGS). EncryptionKey
//     olmayan kayıt şifresizdir → decryptFileTo düz kopyalar.

export { aesUnwrap, aesWrap } from './aesKeyWrap';
export {
  parseKeybag,
  unlockKeybag,
  unlockKeybagWithKey,
  derivePasscodeKey,
  WRAP_DEVICE,
  WRAP_PASSCODE,
  type Keybag,
  type KeybagClassKey,
} from './keybag';
export { parseFileRecord, type FileRecord } from './fileRecord';
export { openEncryptedBackup, type EncryptedBackupSession } from './encryptedBackup';
export { pkcs7PadLength } from './cbcStream';
export {
  WrongPasswordError,
  EncryptedBackupFormatError,
  KeyUnwrapError,
  MissingClassKeyError,
  DecryptError,
  SessionDisposedError,
} from './errors';

/** Manifest.db Files.flags değerleri. */
export const FILE_FLAGS = { FILE: 1, DIRECTORY: 2, SYMLINK: 4 } as const;
