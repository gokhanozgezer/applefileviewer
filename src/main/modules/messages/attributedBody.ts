/**
 * iMessage `attributedBody` (streamtyped NSAttributedString) → düz metin.
 *
 * Modern iOS, bazı mesajların metnini `message.text` yerine `attributedBody`
 * kolonuna (NSArchiver typedstream binary) yazar. text NULL ama attributedBody dolu
 * olan mesajlar yalnızca `text` okunduğunda "sadece tarih" görünür (metin kaybolur).
 *
 * Gerçek-veri (iOS 26.4.2): 336 mesaj bu durumda. Format `\x04\x0bstreamtyped` ile
 * başlar; metin "NSString" sınıf adından sonra `0x2b` ('+') inline-string marker'ı,
 * ardından length-prefix + UTF-8 bytes olarak gelir. 8/8 örnekte doğru decode edildi.
 *
 * Length encoding (typedstream): tek byte < 0x80; 0x81 + uint16; 0x82 + uint24.
 * Parse edilemezse '' döner (caller text=null bırakır — graceful, crash yok).
 */
export function decodeAttributedBody(buf: Buffer | null | undefined): string {
  if (!buf || buf.length < 10) return '';
  const ns = buf.indexOf(Buffer.from('NSString'));
  if (ns < 0) return '';
  const plus = buf.indexOf(0x2b, ns); // '+' = inline string marker
  if (plus < 0) return '';

  let i = plus + 1;
  const first = buf[i];
  if (first === undefined) return '';
  i += 1;

  let len = first;
  if (first === 0x81) {
    if (i + 2 > buf.length) return '';
    len = buf.readUInt16LE(i);
    i += 2;
  } else if (first === 0x82) {
    if (i + 3 > buf.length) return '';
    len = buf.readUIntLE(i, 3);
    i += 3;
  }

  if (len <= 0 || len > buf.length - i) return '';
  return buf.subarray(i, i + len).toString('utf8');
}
