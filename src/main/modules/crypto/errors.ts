// crypto/errors — şifreli yedek çözümünün tipli hataları.
// Mesajlar parola/anahtar İÇERMEZ (loglanabilir güvenli metin).

/** Parola yanlış: parola-sarılı (WRAP & 2) bir sınıf anahtarı RFC 3394 bütünlük kontrolünü geçemedi. */
export class WrongPasswordError extends Error {
  readonly code = 'WRONG_PASSWORD' as const;
  constructor() {
    super('Yedek parolası yanlış');
    this.name = 'WrongPasswordError';
  }
}

/** Yedek/keybag/Manifest yapısı beklenen formatta değil (eksik alan, bozuk TLV, bozuk plist...). */
export class EncryptedBackupFormatError extends Error {
  readonly code = 'ENCRYPTED_BACKUP_FORMAT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'EncryptedBackupFormatError';
  }
}

/** RFC 3394 unwrap bütünlük (IV) kontrolü başarısız — yanlış KEK veya bozuk sarılı anahtar. */
export class KeyUnwrapError extends Error {
  readonly code = 'KEY_UNWRAP_FAILED' as const;
  constructor() {
    super('AES key unwrap bütünlük kontrolü başarısız');
    this.name = 'KeyUnwrapError';
  }
}

/** Dosya kaydının koruma sınıfı için keybag'de açılmış anahtar yok. */
export class MissingClassKeyError extends Error {
  readonly code = 'MISSING_CLASS_KEY' as const;
  constructor(public readonly protectionClass: number) {
    super(`Koruma sınıfı ${protectionClass} için anahtar yok`);
    this.name = 'MissingClassKeyError';
  }
}

/** Şifre çözülen içerik tutarsız (blok hizası / geçersiz padding + Size uyuşmazlığı). */
export class DecryptError extends Error {
  readonly code = 'DECRYPT_FAILED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DecryptError';
  }
}

/** Oturum dispose edildikten sonra kullanım. */
export class SessionDisposedError extends Error {
  readonly code = 'SESSION_DISPOSED' as const;
  constructor() {
    super('Şifreli yedek oturumu kapatılmış');
    this.name = 'SessionDisposedError';
  }
}
