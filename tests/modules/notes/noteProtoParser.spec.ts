import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { decodeNoteBody, decodeNoteRich } from '@main/modules/notes/noteProtoParser';
import { buildNoteProto, buildNoteZdata, buildRichNoteProto } from './notesFixture';

describe('decodeNoteBody (gzip + protobuf)', () => {
  it('gerçek gzip+protobuf üret → decode → metin doğru (field 2>3>2)', () => {
    const text = '~Bilgiler~\nyesil ic 1.4-1.6';
    const zdata = buildNoteZdata(text); // gzip(protobuf)
    expect(zdata[0]).toBe(0x1f); // gzip magic
    expect(zdata[1]).toBe(0x8b);
    expect(decodeNoteBody(zdata)).toBe(text);
  });

  it('Türkçe karakter (UTF-8) round-trip korunur', () => {
    const text = 'Türkçe gövde ğüşıöç — satır2';
    expect(decodeNoteBody(buildNoteZdata(text))).toBe(text);
  });

  it('gzip değil — ham protobuf buffer da decode edilir', () => {
    const text = 'ham protobuf metni';
    const proto = buildNoteProto(text); // gzip YOK
    expect(proto[0]).not.toBe(0x1f);
    expect(decodeNoteBody(proto)).toBe(text);
  });

  it('yapısal parse fail → FALLBACK en uzun geçerli UTF-8 string', () => {
    // field 2>3>2 zincirini KURMA; düz tek string field'lı protobuf.
    // tag = 1<<3 | 2 = 0x0a, len, payload
    const longText = 'bu en uzun gecerli utf8 metin govdesidir burada';
    const shortText = 'kisa';
    const f1 = Buffer.concat([
      Buffer.from([0x0a, shortText.length]),
      Buffer.from(shortText, 'utf8'),
    ]);
    const f2 = Buffer.concat([Buffer.from([0x12, longText.length]), Buffer.from(longText, 'utf8')]);
    const proto = Buffer.concat([f1, f2]);
    expect(decodeNoteBody(proto)).toBe(longText);
  });

  it('gzip(fallback protobuf) — gunzip sonrası yapısal yoksa heuristik', () => {
    const longText = 'gzip ile sarili fallback govde metni uzun olan';
    const f = Buffer.concat([Buffer.from([0x0a, longText.length]), Buffer.from(longText, 'utf8')]);
    const zdata = zlib.gzipSync(f);
    expect(decodeNoteBody(zdata)).toBe(longText);
  });

  it('boş / null / undefined → "" (crash yok)', () => {
    expect(decodeNoteBody(Buffer.alloc(0))).toBe('');
    expect(decodeNoteBody(null)).toBe('');
    expect(decodeNoteBody(undefined)).toBe('');
  });

  it('bozuk gzip / çöp buffer → "" (graceful)', () => {
    // gzip magic ile başlayan ama bozuk içerik → gunzip fail → ham dene → çöp
    const corrupt = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xfe, 0xfd, 0xfc]);
    expect(() => decodeNoteBody(corrupt)).not.toThrow();
    expect(typeof decodeNoteBody(corrupt)).toBe('string');
  });
});

describe('decodeNoteRich (attributeRun)', () => {
  it('kalın/italik/altı çizili run çözümü', () => {
    const text = 'normal kalin italik';
    const proto = buildRichNoteProto(text, [
      { length: 7 }, // 'normal '
      { length: 6, fontWeight: 1 }, // 'kalin ' bold
      { length: 6, fontWeight: 2, underline: true }, // 'italik' italic+underline
    ]);
    const rich = decodeNoteRich(zlib.gzipSync(proto));
    expect(rich.text).toBe(text);
    expect(rich.runs).toHaveLength(3);
    expect(rich.runs[0]).toMatchObject({ start: 0, length: 7, bold: false, italic: false });
    expect(rich.runs[1]).toMatchObject({ start: 7, length: 6, bold: true, italic: false });
    expect(rich.runs[2]).toMatchObject({
      start: 13,
      length: 6,
      italic: true,
      underline: true,
    });
  });

  it('bold+italic (fontWeight 3) ve strikethrough', () => {
    const proto = buildRichNoteProto('abcdef', [{ length: 6, fontWeight: 3, strikethrough: true }]);
    const rich = decodeNoteRich(proto); // gzip'siz ham proto da desteklenir
    expect(rich.runs[0]).toMatchObject({
      bold: true,
      italic: true,
      strikethrough: true,
    });
  });

  it('checklist run (styleType 103 + done)', () => {
    const text = 'yapildi\nyapilmadi';
    const proto = buildRichNoteProto(text, [
      { length: 8, styleType: 103, checklistDone: true },
      { length: 9, styleType: 103, checklistDone: false },
    ]);
    const rich = decodeNoteRich(zlib.gzipSync(proto));
    expect(rich.runs[0]).toMatchObject({ styleType: 103, checklistDone: true });
    expect(rich.runs[1]).toMatchObject({ styleType: 103, checklistDone: false, start: 8 });
  });

  it('run toplamı metni aşarsa biçim atılır (düz metin korunur)', () => {
    const proto = buildRichNoteProto('kisa', [{ length: 999, fontWeight: 1 }]);
    const rich = decodeNoteRich(proto);
    expect(rich.text).toBe('kisa');
    expect(rich.runs).toEqual([]);
  });

  it('yapısal parse yoksa fallback düz metin + boş runs', () => {
    const longText = 'fallback yolunda uzun govde metni ornegi';
    const f = Buffer.concat([Buffer.from([0x0a, longText.length]), Buffer.from(longText, 'utf8')]);
    const rich = decodeNoteRich(f);
    expect(rich.text).toBe(longText);
    expect(rich.runs).toEqual([]);
  });

  it('boş/null → boş sonuç', () => {
    expect(decodeNoteRich(null)).toEqual({ text: '', runs: [] });
    expect(decodeNoteRich(Buffer.alloc(0))).toEqual({ text: '', runs: [] });
  });
});
