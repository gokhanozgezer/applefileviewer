// Ekran görüntüleri için SENTETİK fotoğraf kütüphanesi — buildBackup.ts'in minimal
// Photos.sqlite'ını (3 kayıt, dosyasız) zengin bir sürümle değiştirir: ~30 JPEG
// (SVG gradyanlarından sharp ile üretilir) + birkaç kullanıcı albümü. Gerçek
// yedek/fotoğraf ASLA kullanılmaz. better-sqlite3 Electron ABI'de → Electron-Node
// + vite-node altında koşar (bkz. screenshotsSetup.ts).
// Kullanım: vite-node screenshotPhotos.ts <backupParentDir> <udid>
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { computeFileId } from '../../src/main/modules/manifest/fileId';

const [parent, udid] = process.argv.slice(2);
if (!parent || !udid) {
  console.error('kullanım: screenshotPhotos.ts <backupParentDir> <udid>');
  process.exit(1);
}

const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#0ea5e9', '#6366f1', '#f8fafc'],
  ['#f97316', '#db2777', '#fff7ed'],
  ['#22c55e', '#0d9488', '#f0fdf4'],
  ['#facc15', '#f97316', '#fffbeb'],
  ['#a855f7', '#ec4899', '#faf5ff'],
  ['#14b8a6', '#3b82f6', '#ecfeff'],
  ['#ef4444', '#f59e0b', '#fef2f2'],
  ['#64748b', '#0f172a', '#e2e8f0'],
];

/** Basit "manzara" kompozisyonu: gökyüzü gradyanı + güneş + tepe siluetleri. */
function sceneSvg(i: number, w: number, h: number): string {
  const [a, b, c] = PALETTES[i % PALETTES.length]!;
  const sunX = 0.2 * w + ((i * 137) % Math.round(0.6 * w));
  const sunY = 0.25 * h + ((i * 53) % Math.round(0.2 * h));
  const r = Math.round(Math.min(w, h) * (0.08 + (i % 4) * 0.02));
  const hill = (y: number, amp: number, phase: number) => {
    const pts: string[] = [`0,${h}`];
    for (let x = 0; x <= w; x += w / 8) {
      pts.push(`${x.toFixed(0)},${(y + Math.sin(x / (w / 3) + phase) * amp).toFixed(0)}`);
    }
    pts.push(`${w},${h}`);
    return pts.join(' ');
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${r}" fill="${c}" opacity="0.85"/>
  <polygon points="${hill(h * 0.68, h * 0.05, i)}" fill="#000" opacity="0.18"/>
  <polygon points="${hill(h * 0.8, h * 0.04, i * 2 + 1)}" fill="#000" opacity="0.32"/>
</svg>`;
}

const APPLE_EPOCH = 978_307_200; // 2001-01-01 UTC (unix sn)
const base = Date.UTC(2026, 7, 30) / 1000 - APPLE_EPOCH;

interface Asset {
  file: string;
  w: number;
  h: number;
  date: number;
  favorite: number;
  kind: number;
}

async function main(): Promise<void> {
  const backupDir = path.join(parent!, udid!);
  const assets: Asset[] = [];
  const COUNT = 36;
  for (let i = 0; i < COUNT; i++) {
    const portrait = i % 3 === 1;
    const w = portrait ? 900 : 1200;
    const h = portrait ? 1200 : 900;
    const file = `IMG_${String(1001 + i).padStart(4, '0')}.JPG`;
    const rel = `Media/DCIM/100APPLE/${file}`;
    const id = computeFileId('CameraRollDomain', rel);
    const dir = path.join(backupDir, id.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    await sharp(Buffer.from(sceneSvg(i, w, h)))
      .jpeg({ quality: 78 })
      .toFile(path.join(dir, id));
    assets.push({
      file,
      w,
      h,
      date: base - i * 26_000 - (i % 5) * 3_600,
      favorite: i % 7 === 0 ? 1 : 0,
      kind: 0,
    });
  }

  const fid = computeFileId('CameraRollDomain', 'Media/PhotoData/Photos.sqlite');
  const dbPath = path.join(backupDir, fid.slice(0, 2), fid);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE ZASSET (
      Z_PK INTEGER PRIMARY KEY,
      ZDIRECTORY TEXT, ZFILENAME TEXT, ZDATECREATED REAL,
      ZFAVORITE INTEGER, ZHIDDEN INTEGER, ZKIND INTEGER, ZKINDSUBTYPE INTEGER,
      ZTRASHEDSTATE INTEGER, ZWIDTH INTEGER, ZHEIGHT INTEGER, ZDURATION REAL,
      ZUNIFORMTYPEIDENTIFIER TEXT, ZDERIVEDCAMERACAPTUREDEVICE INTEGER
    );
    CREATE TABLE ZGENERICALBUM (Z_PK INTEGER PRIMARY KEY, ZKIND INTEGER, ZTITLE TEXT, ZTRASHEDSTATE INTEGER);
    CREATE TABLE Z_28ASSETS (Z_28ALBUMS INTEGER, Z_3ASSETS INTEGER, Z_FOK_3ASSETS INTEGER);
  `);
  const ins = db.prepare(`INSERT INTO ZASSET
    (Z_PK, ZDIRECTORY, ZFILENAME, ZDATECREATED, ZFAVORITE, ZHIDDEN, ZKIND, ZKINDSUBTYPE,
     ZTRASHEDSTATE, ZWIDTH, ZHEIGHT, ZDURATION, ZUNIFORMTYPEIDENTIFIER, ZDERIVEDCAMERACAPTUREDEVICE)
    VALUES (?,?,?,?,?,0,?,?,0,?,?,NULL,'public.jpeg',?)`);
  assets.forEach((a, i) =>
    ins.run(
      i + 1,
      'DCIM/100APPLE',
      a.file,
      a.date,
      a.favorite,
      a.kind,
      i % 9 === 4 ? 2 : 0,
      a.w,
      a.h,
      i % 11 === 3 ? 1 : 0,
    ),
  );
  const albums = ['Summer Trip', 'Family', 'Mountains', 'Weekend'];
  const insAlbum = db.prepare(
    'INSERT INTO ZGENERICALBUM (Z_PK, ZKIND, ZTITLE, ZTRASHEDSTATE) VALUES (?,2,?,0)',
  );
  const link = db.prepare(
    'INSERT INTO Z_28ASSETS (Z_28ALBUMS, Z_3ASSETS, Z_FOK_3ASSETS) VALUES (?,?,?)',
  );
  albums.forEach((t, k) => {
    insAlbum.run(100 + k, t);
    for (let i = k; i < assets.length; i += albums.length + k) link.run(100 + k, i + 1, i);
  });
  db.close();
  console.log(
    `[screenshots] sentetik fotoğraf kütüphanesi: ${assets.length} JPEG, ${albums.length} albüm`,
  );
}

void main();
