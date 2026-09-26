// Test yardımcısı: minimal binary plist (bplist00) yazıcı — NSKeyedArchiver UID desteğiyle.
// Desteklenen: null, boolean, int (number/bigint), real (tamsayı olmayan number), string
// (ASCII → 0x5, diğer → UTF-16BE 0x6), Date, Buffer (data), PlistUid, dizi, dict.
import { PlistUid } from '@main/util/bplist';

export type WritableValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Date
  | Buffer
  | PlistUid
  | WritableValue[]
  | { [k: string]: WritableValue };

const APPLE_EPOCH_MS = 978307200000;

function intBytes(n: number): number {
  if (n < 0x100) return 1;
  if (n < 0x10000) return 2;
  if (n < 0x100000000) return 4;
  return 8;
}

function writeUIntBE(v: number, size: number): Buffer {
  const b = Buffer.alloc(size);
  let x = BigInt(v);
  for (let i = size - 1; i >= 0; i--) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

export function writeBplist(root: WritableValue): Buffer {
  // 1) Nesneleri düzleştir (dedupe yok — her değer ayrı nesne; CF de böyle okur)
  type Node =
    | { kind: 'leaf'; value: WritableValue }
    | { kind: 'array'; refs: number[] }
    | { kind: 'dict'; keyRefs: number[]; valRefs: number[] };
  const nodes: Node[] = [];

  const add = (v: WritableValue): number => {
    const idx = nodes.length;
    if (Array.isArray(v)) {
      nodes.push({ kind: 'array', refs: [] });
      const refs = v.map(add);
      nodes[idx] = { kind: 'array', refs };
    } else if (
      v !== null &&
      typeof v === 'object' &&
      !Buffer.isBuffer(v) &&
      !(v instanceof Date) &&
      !(v instanceof PlistUid)
    ) {
      nodes.push({ kind: 'dict', keyRefs: [], valRefs: [] });
      const entries = Object.entries(v);
      const keyRefs = entries.map(([k]) => add(k));
      const valRefs = entries.map(([, val]) => add(val));
      nodes[idx] = { kind: 'dict', keyRefs, valRefs };
    } else {
      nodes.push({ kind: 'leaf', value: v });
    }
    return idx;
  };
  add(root);

  const refSize = intBytes(nodes.length);
  const lenHeader = (type: number, len: number): Buffer => {
    if (len < 15) return Buffer.from([(type << 4) | len]);
    const sz = intBytes(len);
    const pow = sz === 1 ? 0 : sz === 2 ? 1 : sz === 4 ? 2 : 3;
    return Buffer.concat([Buffer.from([(type << 4) | 0xf, 0x10 | pow]), writeUIntBE(len, sz)]);
  };
  const refs = (list: number[]): Buffer => Buffer.concat(list.map((r) => writeUIntBE(r, refSize)));

  const encode = (n: Node): Buffer => {
    if (n.kind === 'array') return Buffer.concat([lenHeader(0xa, n.refs.length), refs(n.refs)]);
    if (n.kind === 'dict') {
      return Buffer.concat([lenHeader(0xd, n.keyRefs.length), refs(n.keyRefs), refs(n.valRefs)]);
    }
    const v = n.value;
    if (v === null) return Buffer.from([0x00]);
    if (v === false) return Buffer.from([0x08]);
    if (v === true) return Buffer.from([0x09]);
    if (typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v))) {
      const big = BigInt(v);
      if (big >= 0n && big < 0x100000000n) {
        const sz = intBytes(Number(big));
        const pow = sz === 1 ? 0 : sz === 2 ? 1 : 2;
        return Buffer.concat([Buffer.from([0x10 | pow]), writeUIntBE(Number(big), sz)]);
      }
      const b = Buffer.alloc(9);
      b[0] = 0x13;
      b.writeBigInt64BE(big, 1);
      return b;
    }
    if (typeof v === 'number') {
      const b = Buffer.alloc(9);
      b[0] = 0x23;
      b.writeDoubleBE(v, 1);
      return b;
    }
    if (typeof v === 'string') {
      // eslint-disable-next-line no-control-regex
      if (/^[\x00-\x7f]*$/.test(v)) {
        return Buffer.concat([lenHeader(0x5, v.length), Buffer.from(v, 'latin1')]);
      }
      const le = Buffer.from(v, 'utf16le');
      le.swap16();
      return Buffer.concat([lenHeader(0x6, le.length / 2), le]);
    }
    if (v instanceof Date) {
      const b = Buffer.alloc(9);
      b[0] = 0x33;
      b.writeDoubleBE((v.getTime() - APPLE_EPOCH_MS) / 1000, 1);
      return b;
    }
    if (Buffer.isBuffer(v)) return Buffer.concat([lenHeader(0x4, v.length), v]);
    if (v instanceof PlistUid) {
      const sz = v.uid < 0x100 ? 1 : v.uid < 0x10000 ? 2 : 4;
      return Buffer.concat([Buffer.from([0x80 | (sz - 1)]), writeUIntBE(v.uid, sz)]);
    }
    throw new Error('writeBplist: desteklenmeyen değer');
  };

  const header = Buffer.from('bplist00', 'latin1');
  const bodies: Buffer[] = [];
  const offsets: number[] = [];
  let pos = header.length;
  for (const n of nodes) {
    const b = encode(n);
    offsets.push(pos);
    bodies.push(b);
    pos += b.length;
  }
  const offsetSize = intBytes(pos);
  const table = Buffer.concat(offsets.map((o) => writeUIntBE(o, offsetSize)));
  const trailer = Buffer.alloc(32);
  trailer[6] = offsetSize;
  trailer[7] = refSize;
  trailer.writeBigUInt64BE(BigInt(nodes.length), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(pos), 24);
  return Buffer.concat([header, ...bodies, table, trailer]);
}
