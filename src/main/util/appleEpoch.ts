// util/appleEpoch — Apple Cocoa Core Data epoch (2001-01-01 UTC) dönüşümleri.
// Spec §6.6 (SMS nanosecond) + §6.8 (CallHistory saniye) için kullanılır.

const APPLE_EPOCH_OFFSET_SEC = 978_307_200; // 2001-01-01 UTC unix sec
const NS_PER_SEC = 1_000_000_000n;

function assertFiniteNumber(value: number, fnName: string, paramName: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fnName}: ${paramName} finite number bekleniyor, alındı: ${value}`);
  }
}

/**
 * Apple epoch'tan saniye cinsinden değeri JS Date'e çevirir.
 * Kullanım: CallHistory ZCALLRECORD.ZDATE, eski sms.db (iOS < 11), WhatsApp ZWAMESSAGE.ZMESSAGEDATE
 */
export function appleSecondsToDate(appleSec: number): Date {
  assertFiniteNumber(appleSec, 'appleSecondsToDate', 'appleSec');
  return new Date((appleSec + APPLE_EPOCH_OFFSET_SEC) * 1000);
}

/**
 * Apple epoch'tan nanosaniye cinsinden değeri JS Date'e çevirir.
 *
 * Input: bigint VEYA number. number path'te değer MAX_SAFE_INTEGER üstündeyse
 * RangeError throw — sessiz precision kaybı YASAK. Caller bigint kullanmaya zorlanır.
 *
 * Sözleşme: nanos → Date çevirimi LOSSY (JS Date ms precision); aynı ms'e
 * düşen nanos değerleri aynı Date'e map eder.
 */
export function appleNanosToDate(appleNs: bigint | number): Date {
  let ns: bigint;
  if (typeof appleNs === 'bigint') {
    ns = appleNs;
  } else if (typeof appleNs === 'number') {
    if (!Number.isFinite(appleNs)) {
      throw new TypeError(`appleNanosToDate: finite number bekleniyor, alındı: ${appleNs}`);
    }
    if (appleNs > Number.MAX_SAFE_INTEGER || appleNs < Number.MIN_SAFE_INTEGER) {
      throw new RangeError(
        `appleNanosToDate: number ${appleNs} > MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}); ` +
          `bigint kullan — sessiz precision kaybı yasak.`,
      );
    }
    ns = BigInt(appleNs);
  } else {
    throw new TypeError(
      `appleNanosToDate: bigint veya number bekleniyor, alındı: ${typeof appleNs}`,
    );
  }

  const sec = Number(ns / NS_PER_SEC);
  const remainingNs = Number(ns % NS_PER_SEC);
  // ms precision (truncation) — sözleşme: nanos → Date LOSSY
  const ms = sec * 1000 + Math.trunc(remainingNs / 1_000_000);
  return new Date(ms + APPLE_EPOCH_OFFSET_SEC * 1000);
}

/**
 * JS Date'i Apple epoch saniyesine çevirir (round-trip için).
 */
export function dateToAppleSeconds(d: Date): number {
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    throw new TypeError(`dateToAppleSeconds: geçerli Date bekleniyor, alındı: ${d}`);
  }
  return d.getTime() / 1000 - APPLE_EPOCH_OFFSET_SEC;
}
