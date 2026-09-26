// util/bplist — sıkı (strict) binary plist okuyucu, NSKeyedArchiver UID desteğiyle.
//
// Neden ayrı parser: bplist-parser (util/plist.ts) tamsayıları 32-bit bit-op'larla
// okur → 2 GB üstü `Size` değerleri negatif/yanlış çıkar; UID'leri de tipsiz bir
// nesne olarak döndürür. Manifest.db `file` blob'ları (MBFile) GB'lık dosya boyutu
// taşıdığı için 64-bit doğru okuma gerekir.
//
// Sözleşme: bozuk girdi → BplistFormatError (THROW). Çağıran (crypto modülü)
// bunu format hatası olarak yüzeye çıkarır. Döngüsel referans / aşırı derinlik korunur.

export class PlistUid {
  constructor(public readonly uid: number) {}
}

export type BplistValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Date
  | Buffer
  | PlistUid
  | BplistValue[]
  | { [k: string]: BplistValue };

export class BplistFormatError extends Error {
  readonly code = 'BPLIST_FORMAT' as const;
  constructor(msg: string) {
    super(`bplist: ${msg}`);
    this.name = 'BplistFormatError';
  }
}

const MAGIC = 'bplist';
const APPLE_EPOCH_MS = 978307200000; // 2001-01-01T00:00:00Z
const MAX_DEPTH = 64;

export function isBplist(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 6).toString('latin1') === MAGIC;
}

/** Big-endian işaretsiz tamsayı (1..8 bayt) → number; 2^53 üstü → hata. */
function readUIntBE(buf: Buffer, off: number, len: number): number {
  if (off < 0 || off + len > buf.length) throw new BplistFormatError('sınır dışı okuma');
  let v = 0n;
  for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(buf[off + i] ?? 0);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new BplistFormatError('tamsayı çok büyük');
  return Number(v);
}

/**
 * Binary plist'i parse eder. Tamsayılar: 8 bayt işaretli (CF semantiği) → güvenli
 * aralıkta number, dışında bigint; 16 bayt → alt 8 bayt (CF de böyle yazar).
 */
export function parseBplist(buf: Buffer): BplistValue {
  if (!Buffer.isBuffer(buf)) throw new TypeError('parseBplist: Buffer bekleniyor');
  if (!isBplist(buf) || buf.length < 40) throw new BplistFormatError('magic/boyut geçersiz');

  const trailer = buf.subarray(buf.length - 32);
  const offsetSize = trailer.readUInt8(6);
  const refSize = trailer.readUInt8(7);
  const numObjects = readUIntBE(trailer, 8, 8);
  const topObject = readUIntBE(trailer, 16, 8);
  const tableOffset = readUIntBE(trailer, 24, 8);
  if (offsetSize < 1 || offsetSize > 8 || refSize < 1 || refSize > 8) {
    throw new BplistFormatError('trailer geçersiz');
  }
  if (topObject >= numObjects || tableOffset + numObjects * offsetSize > buf.length - 32) {
    throw new BplistFormatError('offset tablosu geçersiz');
  }

  const offsets: number[] = new Array<number>(numObjects);
  for (let i = 0; i < numObjects; i++) {
    offsets[i] = readUIntBE(buf, tableOffset + i * offsetSize, offsetSize);
  }

  const visiting = new Set<number>();

  /** Nesne başlığındaki uzunluk: info < 15 → info; 15 → takip eden int nesnesi. */
  function readLength(off: number, info: number): { len: number; start: number } {
    if (info !== 0xf) return { len: info, start: off + 1 };
    const marker = buf[off + 1];
    if (marker === undefined || marker >> 4 !== 0x1)
      throw new BplistFormatError('uzunluk int bekleniyor');
    const n = 1 << (marker & 0xf);
    return { len: readUIntBE(buf, off + 2, n), start: off + 2 + n };
  }

  function parseObj(ref: number, depth: number): BplistValue {
    if (ref >= numObjects) throw new BplistFormatError('nesne referansı sınır dışı');
    if (depth > MAX_DEPTH) throw new BplistFormatError('derinlik sınırı aşıldı');
    const off = offsets[ref] as number;
    if (off >= buf.length - 32) throw new BplistFormatError('nesne ofseti sınır dışı');
    const marker = buf[off] as number;
    const type = marker >> 4;
    const info = marker & 0xf;

    switch (type) {
      case 0x0:
        if (info === 0x0 || info === 0xf) return null;
        if (info === 0x8) return false;
        if (info === 0x9) return true;
        throw new BplistFormatError(`bilinmeyen basit tip 0x${info.toString(16)}`);
      case 0x1: {
        const n = 1 << info;
        if (n === 16) {
          // 128-bit: CF yalnız alt 64 biti anlamlı yazar
          return readInt64(off + 9);
        }
        if (n === 8) return readInt64(off + 1);
        if (n > 8) throw new BplistFormatError('int boyutu geçersiz');
        return readUIntBE(buf, off + 1, n);
      }
      case 0x2: {
        const n = 1 << info;
        if (off + 1 + n > buf.length) throw new BplistFormatError('real sınır dışı');
        if (n === 4) return buf.readFloatBE(off + 1);
        if (n === 8) return buf.readDoubleBE(off + 1);
        throw new BplistFormatError('real boyutu geçersiz');
      }
      case 0x3:
        if (off + 9 > buf.length) throw new BplistFormatError('date sınır dışı');
        return new Date(APPLE_EPOCH_MS + buf.readDoubleBE(off + 1) * 1000);
      case 0x4: {
        const { len, start } = readLength(off, info);
        if (start + len > buf.length) throw new BplistFormatError('data sınır dışı');
        return Buffer.from(buf.subarray(start, start + len));
      }
      case 0x5: {
        const { len, start } = readLength(off, info);
        if (start + len > buf.length) throw new BplistFormatError('string sınır dışı');
        return buf.subarray(start, start + len).toString('latin1');
      }
      case 0x6: {
        const { len, start } = readLength(off, info);
        if (start + len * 2 > buf.length) throw new BplistFormatError('utf16 sınır dışı');
        const be = Buffer.from(buf.subarray(start, start + len * 2));
        be.swap16();
        return be.toString('utf16le');
      }
      case 0x8:
        return new PlistUid(readUIntBE(buf, off + 1, info + 1));
      case 0xa:
      case 0xc: {
        // 0xA array, 0xC set (dizi olarak döner)
        const { len, start } = readLength(off, info);
        if (start + len * refSize > buf.length) throw new BplistFormatError('array sınır dışı');
        return withCycleGuard(ref, () => {
          const arr: BplistValue[] = [];
          for (let i = 0; i < len; i++) {
            arr.push(parseObj(readUIntBE(buf, start + i * refSize, refSize), depth + 1));
          }
          return arr;
        });
      }
      case 0xd: {
        const { len, start } = readLength(off, info);
        if (start + len * 2 * refSize > buf.length) throw new BplistFormatError('dict sınır dışı');
        return withCycleGuard(ref, () => {
          const dict: { [k: string]: BplistValue } = Object.create(null) as {
            [k: string]: BplistValue;
          };
          for (let i = 0; i < len; i++) {
            const k = parseObj(readUIntBE(buf, start + i * refSize, refSize), depth + 1);
            if (typeof k !== 'string') throw new BplistFormatError('dict anahtarı string değil');
            const vRef = readUIntBE(buf, start + (len + i) * refSize, refSize);
            dict[k] = parseObj(vRef, depth + 1);
          }
          return dict;
        });
      }
      default:
        throw new BplistFormatError(`bilinmeyen nesne tipi 0x${type.toString(16)}`);
    }
  }

  function readInt64(at: number): number | bigint {
    if (at + 8 > buf.length) throw new BplistFormatError('int64 sınır dışı');
    const v = buf.readBigInt64BE(at);
    const safe = v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER);
    return safe ? Number(v) : v;
  }

  function withCycleGuard<T>(ref: number, fn: () => T): T {
    if (visiting.has(ref)) throw new BplistFormatError('döngüsel referans');
    visiting.add(ref);
    try {
      return fn();
    } finally {
      visiting.delete(ref);
    }
  }

  return parseObj(topObject, 0);
}
