import { describe, it, expect } from 'vitest';
import { appleSecondsToDate, appleNanosToDate, dateToAppleSeconds } from '@main/util/appleEpoch';

/**
 * Apple Cocoa Core Data epoch = 2001-01-01 00:00:00 UTC = Unix 978307200 saniye.
 * Tüm assertion'lar toISOString() ile UTC pinli — test makinesinin TZ'inden BAĞIMSIZ.
 *
 * Golden vakalar:
 *   - appleSec 0 → 2001-01-01T00:00:00.000Z (epoch reference)
 *   - appleSec 689270400 → 2022-11-04T16:00:00.000Z (Unix 1667577600 sec)
 *   - appleNs 689270400000000000n → AYNI '2022-11-04T16:00:00.000Z'
 *   - Round-trip
 *   - Nanos precision: 123456789 ns → 123 ms (JS Date ms precision)
 */
describe('appleEpoch — Apple Cocoa Core Data (2001-01-01 UTC)', () => {
  it('appleSecondsToDate: 0 → 2001-01-01T00:00:00.000Z (epoch reference)', () => {
    expect(appleSecondsToDate(0).toISOString()).toBe('2001-01-01T00:00:00.000Z');
  });

  it('appleNanosToDate: 0n → 2001-01-01T00:00:00.000Z (epoch reference)', () => {
    expect(appleNanosToDate(0n).toISOString()).toBe('2001-01-01T00:00:00.000Z');
  });

  it('appleSecondsToDate: 689270400 → 2022-11-04T16:00:00.000Z UTC golden (CallHistory format)', () => {
    // 689270400 (Apple sec) + 978307200 (Unix offset) = 1667577600 Unix sec
    expect(appleSecondsToDate(689270400).toISOString()).toBe('2022-11-04T16:00:00.000Z');
  });

  it('appleNanosToDate: 689270400000000000n → 2022-11-04T16:00:00.000Z UTC golden (sms.db iOS 11+ format)', () => {
    // 689270400_000_000_000 ns = 689270400 sec — same UTC date as second-format above
    expect(appleNanosToDate(689270400000000000n).toISOString()).toBe('2022-11-04T16:00:00.000Z');
  });

  it('appleNanosToDate: 1_000_000_000 ns = 1 sec since epoch → 2001-01-01T00:00:01.000Z', () => {
    // Number variant (< 2^53 safe için)
    expect(appleNanosToDate(1_000_000_000).toISOString()).toBe('2001-01-01T00:00:01.000Z');
    // BigInt variant
    expect(appleNanosToDate(1_000_000_000n).toISOString()).toBe('2001-01-01T00:00:01.000Z');
  });

  it('appleNanosToDate: ms precision rounding (689270400123456789 ns → 123 ms)', () => {
    // 689270400 sec + 123456789 ns ekstra = 123.456789 ms → 123 ms (JS Date precision)
    expect(appleNanosToDate(689270400123456789n).toISOString()).toBe('2022-11-04T16:00:00.123Z');
  });

  it('dateToAppleSeconds: 2001-01-01T00:00:00.000Z → 0 (epoch round-trip)', () => {
    expect(dateToAppleSeconds(new Date('2001-01-01T00:00:00.000Z'))).toBe(0);
  });

  it('dateToAppleSeconds: full round-trip — appleSec → Date → appleSec', () => {
    const d = new Date('2024-05-09T14:32:00.000Z');
    expect(appleSecondsToDate(dateToAppleSeconds(d)).toISOString()).toBe(d.toISOString());
  });

  // Edge #1 — Negatif değer (epoch öncesi tarih)
  it('appleSecondsToDate: negatif değer (epoch öncesi) — geçerli Date döner, crash YOK', () => {
    // -978307200 Apple sec + 978307200 Unix offset = 0 Unix sec = 1970-01-01T00:00:00Z
    expect(appleSecondsToDate(-978307200).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  // Edge #2 — number path precision sınırı (KRİTİK)
  it('appleNanosToDate: number > MAX_SAFE_INTEGER ise RangeError throw (sessiz precision kaybı yasak)', () => {
    // 689270400000000000 = 6.89e17, MAX_SAFE_INTEGER (9.007e15) ÜSTÜNDE
    // bigint olmadan number geçilirse precision kaybedilir → caller bigint kullanmaya zorlanır
    expect(() => appleNanosToDate(689270400000000000)).toThrow(RangeError);
    expect(() => appleNanosToDate(689270400000000000)).toThrow(/MAX_SAFE_INTEGER|bigint/i);
  });

  // Edge #3 — Invalid input (NaN, finite olmayan)
  it('appleSecondsToDate: NaN veya Infinity için TypeError (silent Invalid Date yasak)', () => {
    expect(() => appleSecondsToDate(NaN)).toThrow(TypeError);
    expect(() => appleSecondsToDate(Infinity)).toThrow(TypeError);
    expect(() => appleSecondsToDate(-Infinity)).toThrow(TypeError);
  });

  it('appleNanosToDate: NaN number için TypeError', () => {
    expect(() => appleNanosToDate(NaN)).toThrow(TypeError);
  });

  // Edge #4 — Nanos round-trip lossy (ms truncation belgele)
  it('appleNanosToDate: ms precision truncation — iki farklı nanos AYNI Date (lossy round-trip)', () => {
    // Her ikisi 123 ms civarı (123.456ms vs 123.999ms) → JS Date 123 ms olarak truncate
    const ns1 = 689270400123456000n;
    const ns2 = 689270400123999999n;
    expect(appleNanosToDate(ns1).toISOString()).toBe('2022-11-04T16:00:00.123Z');
    expect(appleNanosToDate(ns2).toISOString()).toBe('2022-11-04T16:00:00.123Z');
    expect(appleNanosToDate(ns1).getTime()).toBe(appleNanosToDate(ns2).getTime());
    // Sözleşme: nanos → Date çevirimi LOSSY (ms-grain). dateToAppleNanos yok (read-only app).
  });
});
