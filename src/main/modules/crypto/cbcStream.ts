// crypto/cbcStream — AES-256-CBC (IV = 16 sıfır bayt) akışlı dosya çözümü.
//
// GB'lık dosyalar belleğe alınmaz: okuma akışı → çözücü Transform → yazma akışı.
// Son 16 bayt (padding bloğu) sona kadar tutulur; flush'ta padding politikası uygulanır.
// Yazım atomik: `<out>.<rastgele>.part` geçici dosyaya yazılır, başarıda rename;
// hata/abort'ta geçici dosya silinir (yarım çıktı asla final adda kalmaz).
// Referans: jsharkey13/iphone_backup_decrypt utils.aes_decrypt_chunked.

import crypto from 'node:crypto';
import { once } from 'node:events';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream, openWriteStreamOut, removeOut, renameOut, stat } from '@main/safeFs';
import { DecryptError } from './errors';

const BLOCK = 16;
const ZERO_IV = Buffer.alloc(BLOCK);

/**
 * Padding politikası:
 *  - 'lenient' (Manifest.db): geçerli PKCS7 → soyulur; geçersiz → blok olduğu gibi bırakılır.
 *  - 'file': geçerli PKCS7 → soyulur (referans davranışı; Manifest `Size` canlı
 *    DB'lerde sıkça sapar, bu yüzden geçerli padding varken Size'a GÜVENİLMEZ).
 *    Geçersiz padding → `size` son blok içine düşüyorsa (toplam-16 ≤ size ≤ toplam)
 *    size'a kesilir; aksi halde DecryptError.
 */
export type PaddingPolicy = { mode: 'lenient' } | { mode: 'file'; size: number };

/** Geçerli PKCS7 padding uzunluğu (1..16) veya null. */
export function pkcs7PadLength(lastBlock: Buffer): number | null {
  if (lastBlock.length !== BLOCK) return null;
  const n = lastBlock[BLOCK - 1] as number;
  if (n < 1 || n > BLOCK) return null;
  for (let i = BLOCK - n; i < BLOCK; i++) if (lastBlock[i] !== n) return null;
  return n;
}

class CbcDecryptTransform extends Transform {
  private readonly decipher: crypto.Decipher;
  private held: Buffer = Buffer.alloc(0);
  private total = 0;

  constructor(
    key: Buffer,
    private readonly policy: PaddingPolicy,
  ) {
    super();
    this.decipher = crypto.createDecipheriv('aes-256-cbc', key, ZERO_IV);
    this.decipher.setAutoPadding(false);
  }

  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    try {
      this.total += chunk.length;
      const out = this.decipher.update(chunk);
      const all = this.held.length ? Buffer.concat([this.held, out]) : out;
      // Son tam bloğu tut (padding bloğu olabilir)
      const keep = Math.min(BLOCK, all.length);
      const emit = all.subarray(0, all.length - keep);
      this.held = Buffer.from(all.subarray(all.length - keep));
      if (emit.length) this.push(emit);
      cb();
    } catch (e) {
      cb(e as Error);
    }
  }

  override _flush(cb: TransformCallback): void {
    try {
      const rest = this.decipher.final(); // autoPadding kapalı + hizalı → boş
      const tail = rest.length ? Buffer.concat([this.held, rest]) : this.held;
      this.held = Buffer.alloc(0);
      if (this.total === 0) return cb();
      if (this.total % BLOCK !== 0 || tail.length !== BLOCK) {
        return cb(new DecryptError('Şifreli veri 16 bayta hizalı değil'));
      }
      const pad = pkcs7PadLength(tail);
      if (pad !== null) {
        if (pad < BLOCK) this.push(tail.subarray(0, BLOCK - pad));
        return cb();
      }
      if (this.policy.mode === 'lenient') {
        this.push(tail);
        return cb();
      }
      const size = this.policy.size;
      const before = this.total - BLOCK;
      if (size >= before && size <= this.total && size > 0) {
        if (size > before) this.push(tail.subarray(0, size - before));
        return cb();
      }
      cb(new DecryptError('Geçersiz padding ve Size uyuşmuyor'));
    } catch (e) {
      cb(e as Error);
    }
  }
}

function tmpPathFor(outAbs: string): string {
  return `${outAbs}.${crypto.randomBytes(6).toString('hex')}.part`;
}

/**
 * inAbs'i akışlı çözüp outAbs'e atomik yazar. key === null → şifresiz kopya
 * (aynı atomik yol). Abort/hata → geçici dosya silinir, hata yeniden fırlatılır.
 */
export async function decryptFileStream(opts: {
  inAbs: string;
  outAbs: string;
  key: Buffer | null;
  policy: PaddingPolicy;
  signal?: AbortSignal;
}): Promise<void> {
  const { inAbs, outAbs, key, policy, signal } = opts;
  signal?.throwIfAborted();
  if (key) {
    const st = await stat(inAbs);
    if (st.size % BLOCK !== 0) throw new DecryptError('Şifreli dosya 16 bayta hizalı değil');
  }

  const tmp = tmpPathFor(outAbs);
  let out: Awaited<ReturnType<typeof openWriteStreamOut>> | null = null;
  try {
    out = await openWriteStreamOut(tmp);
    const input = createReadStream(inAbs, { highWaterMark: 1024 * 1024 });
    if (key) {
      await pipeline(input, new CbcDecryptTransform(key, policy), out, { signal });
    } else {
      await pipeline(input, out, { signal });
    }
    signal?.throwIfAborted();
    await renameOut(tmp, outAbs);
  } catch (e) {
    // Windows: fd kapanmadan silme EBUSY/EPERM verir — önce yazma akışının kapanmasını bekle
    if (out && !out.closed) {
      out.destroy();
      await once(out, 'close').catch(() => undefined);
    }
    await removeOut(tmp).catch(() => undefined);
    throw e;
  }
}
