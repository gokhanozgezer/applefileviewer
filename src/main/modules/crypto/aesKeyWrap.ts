// crypto/aesKeyWrap — RFC 3394 AES Key Wrap / Unwrap (varsayılan IV A6A6A6A6A6A6A6A6).
//
// Neden kendi implementasyonumuz: Electron BoringSSL kullanır ve Node'daki
// 'id-aes256-wrap' şifresini SUNMAZ (getCiphers'ta yok). Algoritma AES-ECB tek-blok
// işlemleri üzerine kurulur (RFC 3394 §2.2.1/§2.2.2 "index based" gösterim);
// iphone-dataprotection `AESUnwrap` ile birebir aynı semantik.

import crypto from 'node:crypto';
import { KeyUnwrapError } from './errors';

const DEFAULT_IV = Buffer.from('a6a6a6a6a6a6a6a6', 'hex');

function ecbAlgo(kek: Buffer): string {
  switch (kek.length) {
    case 16:
      return 'aes-128-ecb';
    case 24:
      return 'aes-192-ecb';
    case 32:
      return 'aes-256-ecb';
    default:
      throw new RangeError(`aesKeyWrap: KEK uzunluğu geçersiz (${kek.length})`);
  }
}

/** A ^= t (t: 64-bit big-endian sayaç), yerinde. */
function xorCounter(a: Buffer, t: number): void {
  let x = BigInt(t);
  for (let k = 7; k >= 0 && x > 0n; k--) {
    a[k] = (a[k] as number) ^ Number(x & 0xffn);
    x >>= 8n;
  }
}

/**
 * RFC 3394 unwrap. `wrapped` = (n+1)*8 bayt, n ≥ 2. Bütünlük (IV) tutmazsa
 * KeyUnwrapError — yanlış KEK'in tek güvenilir göstergesi budur.
 */
export function aesUnwrap(kek: Buffer, wrapped: Buffer): Buffer {
  if (wrapped.length % 8 !== 0 || wrapped.length < 24) {
    throw new RangeError(`aesUnwrap: sarılı anahtar uzunluğu geçersiz (${wrapped.length})`);
  }
  const n = wrapped.length / 8 - 1;
  const decipher = crypto.createDecipheriv(ecbAlgo(kek), kek, null);
  decipher.setAutoPadding(false);

  const a = Buffer.from(wrapped.subarray(0, 8));
  const r = Buffer.from(wrapped.subarray(8));
  const block = Buffer.alloc(16);
  try {
    for (let j = 5; j >= 0; j--) {
      for (let i = n; i >= 1; i--) {
        xorCounter(a, n * j + i);
        a.copy(block, 0);
        r.copy(block, 8, (i - 1) * 8, i * 8);
        const b = decipher.update(block);
        b.copy(a, 0, 0, 8);
        b.copy(r, (i - 1) * 8, 8, 16);
        b.fill(0);
      }
    }
    // Sabit-zamanlı karşılaştırma
    if (!crypto.timingSafeEqual(a, DEFAULT_IV)) {
      r.fill(0);
      throw new KeyUnwrapError();
    }
    return r;
  } finally {
    block.fill(0);
    a.fill(0);
  }
}

/** RFC 3394 wrap — test fixture'ları + RFC vektör doğrulaması için. */
export function aesWrap(kek: Buffer, key: Buffer): Buffer {
  if (key.length % 8 !== 0 || key.length < 16) {
    throw new RangeError(`aesWrap: anahtar uzunluğu geçersiz (${key.length})`);
  }
  const n = key.length / 8;
  const cipher = crypto.createCipheriv(ecbAlgo(kek), kek, null);
  cipher.setAutoPadding(false);

  const a = Buffer.from(DEFAULT_IV);
  const r = Buffer.from(key);
  const block = Buffer.alloc(16);
  for (let j = 0; j <= 5; j++) {
    for (let i = 1; i <= n; i++) {
      a.copy(block, 0);
      r.copy(block, 8, (i - 1) * 8, i * 8);
      const b = cipher.update(block);
      b.copy(a, 0, 0, 8);
      xorCounter(a, n * j + i);
      b.copy(r, (i - 1) * 8, 8, 16);
    }
  }
  block.fill(0);
  return Buffer.concat([a, r]);
}
