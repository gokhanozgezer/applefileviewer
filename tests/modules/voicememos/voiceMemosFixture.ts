import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import { computeFileId } from '@main/modules/manifest/fileId';

const VOICEMEMOS_DOMAIN = 'AppDomainGroup-group.com.apple.VoiceMemos.shared';
const VOICEMEMOS_REL = 'Recordings/CloudRecordings.db';

// Apple epoch SANİYE (2001-01-01 UTC tabanı). appleSecondsToDate ile çevrilir.
// Gerçek-veri ham örnek 736422157.667 → 2024-05-03 (FLOAT — saniye + kesir).
export const APPLE_A = 736_000_000.25; // en eski
export const APPLE_B = 736_200_000.5;
export const APPLE_C = 736_422_157.667; // en yeni (gerçek-veri ham örneği)

interface MemoSpec {
  pk: number;
  date: number;
  duration: number;
  customLabel: string | null;
  zpath: string;
}

function dbPath(rootPath: string, udid: string): string {
  const backupDir = path.join(rootPath, udid);
  const fileId = computeFileId(VOICEMEMOS_DOMAIN, VOICEMEMOS_REL);
  const dir = path.join(backupDir, fileId.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fileId);
}

/**
 * Sentetik CloudRecordings.db fixture'ı. KRİTİK: tablo ZCLOUDRECORDING (ZRECORDING DEĞİL).
 * ZDATE saniye-FLOAT (Apple epoch), ZDURATION saniye-FLOAT, ZCUSTOMLABEL başlık,
 * ZPATH dosya adı ("20240503 124237.m4a").
 */
export function writeVoiceMemosFixture(rootPath: string, udid: string): void {
  const abs = dbPath(rootPath, udid);
  const db = new Database(abs);
  // ZRECORDING boş tablo (gerçek-veride 0 kayıt) — tuzak: yanlış tablo seçilirse boş döner.
  db.exec(`
    CREATE TABLE ZRECORDING (
      Z_PK INTEGER PRIMARY KEY,
      ZDATE REAL,
      ZDURATION REAL,
      ZCUSTOMLABEL TEXT,
      ZPATH TEXT
    );
    CREATE TABLE ZCLOUDRECORDING (
      Z_PK INTEGER PRIMARY KEY,
      ZDATE REAL,
      ZDURATION REAL,
      ZCUSTOMLABEL TEXT,
      ZENCRYPTEDTITLE TEXT,
      ZPATH TEXT
    );
  `);

  const memos: MemoSpec[] = [
    {
      pk: 1,
      date: APPLE_A,
      duration: 12.4,
      customLabel: 'İlk kayıt',
      zpath: '20240101 090000.m4a',
    },
    {
      pk: 2,
      date: APPLE_B,
      duration: 63.9,
      customLabel: '', // boş → ZPATH tarihine fallback
      zpath: '20240301 153000.m4a',
    },
    {
      pk: 3,
      date: APPLE_C,
      duration: 5.2,
      customLabel: null, // null → ZPATH tarihine fallback
      zpath: '20240503 124237.m4a',
    },
  ];

  const ins = db.prepare(
    `INSERT INTO ZCLOUDRECORDING (Z_PK, ZDATE, ZDURATION, ZCUSTOMLABEL, ZPATH)
     VALUES (?,?,?,?,?)`,
  );
  for (const m of memos) {
    ins.run(m.pk, m.date, m.duration, m.customLabel, m.zpath);
  }

  db.close();
}

/** Boş CloudRecordings.db — şema var ama 0 kayıt (gerçek-veri empty durumu). */
export function writeEmptyVoiceMemosFixture(rootPath: string, udid: string): void {
  const abs = dbPath(rootPath, udid);
  const db = new Database(abs);
  db.exec(`
    CREATE TABLE ZCLOUDRECORDING (
      Z_PK INTEGER PRIMARY KEY,
      ZDATE REAL,
      ZDURATION REAL,
      ZCUSTOMLABEL TEXT,
      ZPATH TEXT
    );
  `);
  db.close();
}
