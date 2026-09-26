import zlib from 'node:zlib';
import type { NoteRun } from '@shared/domain';

/**
 * Apple Notes not gövdesi decode'u — en karmaşık parse.
 *
 * Pipeline:
 *   1. ZICNOTEDATA.ZDATA = gzip(protobuf). gzip magic `1f 8b` ise gunzipSync,
 *      değilse ham buffer'ı protobuf say (sürüm/şema farkına dayanıklılık).
 *   2. Protobuf walk: manuel varint reader. Apple Notes proto yapısı:
 *        top-level field 2 (document, wire type 2/length-delimited)
 *          → field 3 (note)
 *            → field 2 (noteText, string) = düz not metni.
 *   3. Yapısal parse fail/boş → FALLBACK: protobuf'taki en uzun geçerli UTF-8
 *      length-delimited string'i not metni say (heuristik).
 *   4. Her şey try/catch — boş/hata → '' (crash YOK).
 *
 * Apple Notes proto sürümü değişebilir; bilinmeyen alanlar skip edilir, crash edilmez.
 */

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

interface ProtoField {
  fieldNum: number;
  wireType: number;
  /** WIRE_LEN için ham payload buffer; diğer wire tipleri için undefined. */
  bytes?: Buffer;
  /** WIRE_VARINT için değer (attributeRun alanları bunu okur). */
  varint?: number;
}

/** Basit protobuf okuyucu — offset taşıyan minimal reader. */
class ProtoReader {
  private buf: Buffer;
  private pos: number;

  constructor(buf: Buffer) {
    this.buf = buf;
    this.pos = 0;
  }

  atEnd(): boolean {
    return this.pos >= this.buf.length;
  }

  /** base-128 varint oku. Taşma/eksik byte → throw (caller try/catch ile yakalar). */
  readVarint(): number {
    let result = 0;
    let shift = 0;
    while (true) {
      if (this.pos >= this.buf.length) {
        throw new Error('readVarint: buffer bitti (truncated varint)');
      }
      const byte = this.buf[this.pos]!;
      this.pos += 1;
      // 32-bit altı için number güvenli; üstünü kırp (note text key'leri küçük field/len)
      result += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 63) throw new Error('readVarint: aşırı uzun varint');
    }
    return result;
  }

  /** Sonraki field'ı (tag + payload) oku. */
  readField(): ProtoField {
    const tag = this.readVarint();
    const fieldNum = Math.floor(tag / 8);
    const wireType = tag & 0x7;

    switch (wireType) {
      case WIRE_VARINT: {
        const varint = this.readVarint();
        return { fieldNum, wireType, varint };
      }
      case WIRE_I64:
        this.skip(8);
        return { fieldNum, wireType };
      case WIRE_LEN: {
        const len = this.readVarint();
        if (this.pos + len > this.buf.length) {
          throw new Error('readField: length-delimited payload buffer dışı');
        }
        const bytes = this.buf.subarray(this.pos, this.pos + len);
        this.pos += len;
        return { fieldNum, wireType, bytes };
      }
      case WIRE_I32:
        this.skip(4);
        return { fieldNum, wireType };
      default:
        throw new Error(`readField: bilinmeyen wire type ${wireType}`);
    }
  }

  private skip(n: number): void {
    if (this.pos + n > this.buf.length) {
      throw new Error('skip: buffer dışı');
    }
    this.pos += n;
  }
}

/** Buffer içinde fieldNum (wire type 2) ile eşleşen ilk length-delimited payload'ı döner. */
function findLenField(buf: Buffer, fieldNum: number): Buffer | null {
  const reader = new ProtoReader(buf);
  while (!reader.atEnd()) {
    const field = reader.readField();
    if (field.fieldNum === fieldNum && field.wireType === WIRE_LEN && field.bytes) {
      return field.bytes;
    }
  }
  return null;
}

/**
 * Yapısal walk: document(2) → note(3) → noteText(2).
 * Herhangi bir adım eksikse null döner (caller fallback'e geçer).
 */
function structuredNoteText(proto: Buffer): string | null {
  const document = findLenField(proto, 2); // top-level field 2 = document
  if (!document) return null;
  const note = findLenField(document, 3); // document field 3 = note
  if (!note) return null;
  const noteText = findLenField(note, 2); // note field 2 = noteText (string)
  if (!noteText) return null;
  const text = noteText.toString('utf8');
  return text.length > 0 ? text : null;
}

/**
 * En az bir "okunabilir" karakter içeriyor mu? Tamamen kontrol karakterlerinden
 * (nested proto byte'ları gibi) oluşan string'ler elenir. Tab(0x09)/LF(0x0a)/
 * CR(0x0d) metin sayılır; diğer C0 kontrol karakterleri sayılmaz.
 */
function hasPrintableChar(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) return true;
    if (c >= 0x20 && c !== 0x7f) return true;
  }
  return false;
}

/**
 * Fallback heuristik: protobuf'taki en uzun GEÇERLİ UTF-8 length-delimited
 * string'i not metni say. Nested mesajları da recursive tarar (en derindeki
 * uzun metin genelde gövdedir). Geçersiz UTF-8 (nested proto byte'ları) elenir.
 */
function longestUtf8String(buf: Buffer, depth = 0): string {
  if (depth > 6) return ''; // patolojik nesting koruması
  let best = '';
  const reader = new ProtoReader(buf);
  try {
    while (!reader.atEnd()) {
      const field = reader.readField();
      if (field.wireType === WIRE_LEN && field.bytes && field.bytes.length > 0) {
        const candidate = field.bytes;
        // Geçerli UTF-8 mi? (decode→encode round-trip eşitse temiz string)
        const decoded = candidate.toString('utf8');
        const reEncoded = Buffer.from(decoded, 'utf8');
        if (reEncoded.equals(candidate) && hasPrintableChar(decoded)) {
          if (decoded.length > best.length) best = decoded;
        }
        // Nested proto olabilir — derinlere de bak
        const nested = longestUtf8String(candidate, depth + 1);
        if (nested.length > best.length) best = nested;
      }
    }
  } catch {
    // truncated/parse hatası — o ana kadarki en iyiyi döndür
  }
  return best;
}

// ─── Zengin biçim: attributeRun ──────────────────────────────────────────────
// Apple Notes proto: document(2) > note(3) içinde
//   field 2 = noteText (string)
//   field 5 = repeated attributeRun:
//     field 1 varint  = length (UTF-16 code unit — NSString semantiği, JS slice ile birebir)
//     field 2 len     = paragraphStyle { field 1 varint = styleType; field 5 len = todo { field 2 varint = done } }
//     field 5 varint  = fontWeight (1 bold, 2 italic, 3 bold+italic)
//     field 6 varint  = underlined
//     field 7 varint  = strikethrough
// styleType değerleri (apple_cloud_notes_parser ile uyumlu):
//   0 title, 1 heading, 2 subheading, 4 monospaced, 100 bullet, 101 dash, 102 numbered, 103 checklist
// Bilinmeyen alanlar atlanır; parse hatası → runs [] (gövde düz metin kalır).

export type { NoteRun };

function parseParagraphStyle(buf: Buffer): { styleType: number | null; done: boolean | null } {
  let styleType: number | null = null;
  let done: boolean | null = null;
  const reader = new ProtoReader(buf);
  while (!reader.atEnd()) {
    const f = reader.readField();
    if (f.fieldNum === 1 && f.wireType === WIRE_VARINT) styleType = f.varint ?? null;
    if (f.fieldNum === 5 && f.wireType === WIRE_LEN && f.bytes) {
      const todo = new ProtoReader(f.bytes);
      while (!todo.atEnd()) {
        const tf = todo.readField();
        if (tf.fieldNum === 2 && tf.wireType === WIRE_VARINT) done = (tf.varint ?? 0) !== 0;
      }
    }
  }
  return { styleType, done };
}

function parseAttributeRun(buf: Buffer, start: number): NoteRun {
  const run: NoteRun = {
    start,
    length: 0,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    styleType: null,
    checklistDone: null,
  };
  const reader = new ProtoReader(buf);
  while (!reader.atEnd()) {
    const f = reader.readField();
    switch (f.fieldNum) {
      case 1:
        if (f.wireType === WIRE_VARINT) run.length = f.varint ?? 0;
        break;
      case 2:
        if (f.wireType === WIRE_LEN && f.bytes) {
          const ps = parseParagraphStyle(f.bytes);
          run.styleType = ps.styleType;
          if (ps.styleType === 103) run.checklistDone = ps.done ?? false;
        }
        break;
      case 5:
        if (f.wireType === WIRE_VARINT) {
          run.bold = f.varint === 1 || f.varint === 3;
          run.italic = f.varint === 2 || f.varint === 3;
        }
        break;
      case 6:
        if (f.wireType === WIRE_VARINT) run.underline = (f.varint ?? 0) !== 0;
        break;
      case 7:
        if (f.wireType === WIRE_VARINT) run.strikethrough = (f.varint ?? 0) !== 0;
        break;
      default:
        break;
    }
  }
  return run;
}

/** note mesajından (document>note) metin + attributeRun listesi çıkar. */
function structuredNoteRich(proto: Buffer): { text: string; runs: NoteRun[] } | null {
  const document = findLenField(proto, 2);
  if (!document) return null;
  const note = findLenField(document, 3);
  if (!note) return null;

  let text: string | null = null;
  const runs: NoteRun[] = [];
  let offset = 0;

  const reader = new ProtoReader(note);
  while (!reader.atEnd()) {
    const f = reader.readField();
    if (f.fieldNum === 2 && f.wireType === WIRE_LEN && f.bytes && text == null) {
      text = f.bytes.toString('utf8');
    }
    if (f.fieldNum === 5 && f.wireType === WIRE_LEN && f.bytes) {
      const run = parseAttributeRun(f.bytes, offset);
      offset += run.length;
      runs.push(run);
    }
  }

  if (text == null || text.length === 0) return null;
  // Run toplamı metinden taşıyorsa biçim güvenilmez — düz metin dön.
  const runTotal = runs.reduce((a, r) => a + r.length, 0);
  return { text, runs: runTotal <= text.length ? runs : [] };
}

/**
 * ZICNOTEDATA.ZDATA → metin + biçim run'ları. Yapısal parse başarısızsa
 * decodeNoteBody fallback'i (düz metin, runs []).
 */
export function decodeNoteRich(zdata: Buffer | null | undefined): {
  text: string;
  runs: NoteRun[];
} {
  if (!zdata || zdata.length === 0) return { text: '', runs: [] };

  let proto: Buffer;
  try {
    if (zdata.length >= 2 && zdata[0] === GZIP_MAGIC_0 && zdata[1] === GZIP_MAGIC_1) {
      proto = zlib.gunzipSync(zdata);
    } else {
      proto = zdata;
    }
  } catch {
    proto = zdata;
  }

  try {
    const rich = structuredNoteRich(proto);
    if (rich) return rich;
  } catch {
    /* fallback'e düş */
  }
  return { text: decodeNoteBody(zdata), runs: [] };
}

/**
 * ZICNOTEDATA.ZDATA (gzip+protobuf) → düz not metni.
 * Hata/boş → '' (crash YOK). gzip magic yoksa ham buffer protobuf denenir.
 */
export function decodeNoteBody(zdata: Buffer | null | undefined): string {
  if (!zdata || zdata.length === 0) return '';

  let proto: Buffer;
  try {
    if (zdata.length >= 2 && zdata[0] === GZIP_MAGIC_0 && zdata[1] === GZIP_MAGIC_1) {
      proto = zlib.gunzipSync(zdata);
    } else {
      proto = zdata; // gzip değil — ham protobuf dene
    }
  } catch {
    // gunzip fail — ham buffer'ı yine de protobuf olarak dene
    proto = zdata;
  }

  // 1) Yapısal parse (document>note>noteText)
  try {
    const structured = structuredNoteText(proto);
    if (structured) return structured;
  } catch {
    // yapısal parse fail — fallback'e düş
  }

  // 2) Fallback: en uzun geçerli UTF-8 string
  try {
    return longestUtf8String(proto);
  } catch {
    return '';
  }
}
