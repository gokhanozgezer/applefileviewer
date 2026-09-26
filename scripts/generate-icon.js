// Uygulama ikonu üretici — TEK SVG kaynak → sharp ile PNG'ler → platform paketleri:
//   build/icon.ico        Windows (16..256, PNG gömülü ICO — Vista+)
//   build/icon.png        512px (electron-builder genel/yedek)
//   build/icon.icns       macOS (16..1024, PNG gömülü ICNS; macOS ızgarasına göre kenar boşluklu)
//   build/icons/NxN.png   Linux (16..512 + 1024; electron-builder linux.icon = build/icons)
// Ekstra bağımlılık gerekmez (ICO/ICNS kapları elle paketlenir).
// Çalıştırma: node scripts/generate-icon.js
//
// fs erişimi createRequire ile (copy-worker.js ile aynı kalıp) — no-restricted-imports
// (safeFs gateway) kuralı ürün kodu içindir; build script'i gateway dışıdır.

import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { mkdir, writeFile } = require('node:fs/promises');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Marka motifi: yuvarlatılmış kare mavi degrade zemin + telefon çerçevesi içinde
// fotoğraf glifi (dağ+güneş) — "iOS yedeğinin içine bakan görüntüleyici".
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563EB"/>
      <stop offset="1" stop-color="#0EA5E9"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <rect x="156" y="96" width="200" height="320" rx="36" fill="none" stroke="#ffffff" stroke-width="24"/>
  <circle cx="256" cy="376" r="14" fill="#ffffff"/>
  <g transform="translate(186,150)">
    <rect x="0" y="0" width="140" height="140" rx="18" fill="#ffffff" opacity="0.22"/>
    <circle cx="44" cy="42" r="16" fill="#ffffff"/>
    <path d="M8 118 L52 70 L82 100 L104 78 L132 108 L132 122 A18 18 0 0 1 114 140 L26 140 A18 18 0 0 1 8 122 Z" fill="#ffffff"/>
  </g>
</svg>`;

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

// macOS Big Sur+ ikon ızgarası: 1024 tuvalde ~824px yuvarlatılmış kare (≈%80.5) —
// kenar-kenar Windows çizimi Dock'ta diğer uygulamalardan büyük görünür. Aynı çizim ölçeklenir.
// Mevcut zemin 480/512 → hedef 412/512 ⇒ ölçek ≈ 0.858, merkez sabit.
const MAC_SCALE = 412 / 480;
const SVG_MAC = SVG.replace(
  /(<svg[^>]*>)([\s\S]*)(<\/svg>)/,
  (_m, open, body, close) =>
    `${open}<g transform="translate(256 256) scale(${MAC_SCALE.toFixed(4)}) translate(-256 -256)">${body}</g>${close}`,
);

/**
 * SVG → kare PNG. Kaynak 512 viewBox'lı; büyük boyutlarda bulanık büyütme olmasın diye
 * yoğunluk (density) hedef boyuta göre artırılır (72dpi = 512px).
 */
async function renderPng(svg, size) {
  const density = Math.max(72, Math.ceil((72 * size) / 512));
  return sharp(Buffer.from(svg), { density }).resize(size, size).png().toBuffer();
}

/**
 * ICNS kabı: 'icns' + toplam uzunluk (BE u32), ardından her girdi için
 * OSType (4 bayt) + girdi uzunluğu (başlık dahil, BE u32) + PNG verisi.
 * PNG kabul eden tipler (macOS 10.7+; icp4/icp5 10.11+).
 */
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic07', 128],
  ['ic13', 256], // 128@2x
  ['ic08', 256],
  ['ic14', 512], // 256@2x
  ['ic09', 512],
  ['ic10', 1024], // 512@2x
];

function packIcns(entries) {
  const chunks = entries.map(({ type, buf }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 4, 'ascii');
    h.writeUInt32BE(buf.length + 8, 4);
    return Buffer.concat([h, buf]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

function packIco(pngs) {
  // ICONDIR (6) + ICONDIRENTRY (16 × n) + PNG verileri
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(buf.length, 8); // bytes
    e.writeUInt32LE(offset, 12); // offset
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

const buildDir = path.join(root, 'build');
await mkdir(path.join(buildDir, 'icons'), { recursive: true });

// — Windows —
const pngs = [];
for (const size of SIZES) pngs.push({ size, buf: await renderPng(SVG, size) });
await writeFile(path.join(buildDir, 'icon.ico'), packIco(pngs));
console.log(
  `icon.ico yazıldı (${SIZES.join(', ')} px, ${pngs.reduce((a, p) => a + p.buf.length, 0)} bayt)`,
);

// — Genel PNG (electron-builder bazı hedeflerde ≥512 ister) —
await writeFile(path.join(buildDir, 'icon.png'), await renderPng(SVG, 512));

// — Linux: build/icons/NxN.png —
for (const size of LINUX_SIZES) {
  await writeFile(path.join(buildDir, 'icons', `${size}x${size}.png`), await renderPng(SVG, size));
}
console.log(`icons/*.png yazıldı (${LINUX_SIZES.join(', ')} px)`);

// — macOS: build/icon.icns —
const macCache = new Map();
const icnsEntries = [];
for (const [type, size] of ICNS_TYPES) {
  if (!macCache.has(size)) macCache.set(size, await renderPng(SVG_MAC, size));
  icnsEntries.push({ type, buf: macCache.get(size) });
}
const icns = packIcns(icnsEntries);
await writeFile(path.join(buildDir, 'icon.icns'), icns);
console.log(
  `icon.icns yazıldı (${ICNS_TYPES.map(([t, s]) => `${t}:${s}`).join(', ')}, ${icns.length} bayt)`,
);
