import { describe, it, expect } from 'vitest';
import { decodeAttributedBody } from '@main/modules/messages/attributedBody';

// streamtyped NSAttributedString sentetik buffer kurucu (gerçek format: header +
// NSString sınıfı + 0x2b inline-string marker + length + UTF-8).
function buildStreamtyped(text: string): Buffer {
  const utf8 = Buffer.from(text, 'utf8');
  let lenBytes: Buffer;
  if (utf8.length < 0x80) {
    lenBytes = Buffer.from([0x2b, utf8.length]);
  } else {
    const b = Buffer.alloc(4);
    b[0] = 0x2b;
    b[1] = 0x81;
    b.writeUInt16LE(utf8.length, 2);
    lenBytes = b;
  }
  return Buffer.concat([
    Buffer.from('\x04\x0bstreamtyped'),
    Buffer.from('NSMutableAttributedString NSString '),
    lenBytes,
    utf8,
  ]);
}

describe('decodeAttributedBody (streamtyped)', () => {
  it('kısa metin (tek-byte length)', () => {
    expect(decodeAttributedBody(buildStreamtyped('Merhaba dünya'))).toBe('Merhaba dünya');
  });

  it('Türkçe UTF-8 round-trip', () => {
    const t = 'Parmak uçlarım hala acıyor yandı dün akşam';
    expect(decodeAttributedBody(buildStreamtyped(t))).toBe(t);
  });

  it('uzun metin (0x81 + uint16 length)', () => {
    const t = 'x'.repeat(300);
    expect(decodeAttributedBody(buildStreamtyped(t))).toBe(t);
  });

  it('null/boş buffer → ""', () => {
    expect(decodeAttributedBody(null)).toBe('');
    expect(decodeAttributedBody(undefined)).toBe('');
    expect(decodeAttributedBody(Buffer.alloc(0))).toBe('');
  });

  it('NSString yok → "" (graceful)', () => {
    expect(decodeAttributedBody(Buffer.from('rastgele binary veri xyz'))).toBe('');
  });

  it('length buffer taşarsa → "" (bozuk veri)', () => {
    const bad = Buffer.concat([Buffer.from('NSString'), Buffer.from([0x2b, 0xff])]);
    expect(decodeAttributedBody(bad)).toBe('');
  });
});
