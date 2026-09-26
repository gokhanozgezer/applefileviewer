import type { ReadOnlyDb } from '@main/util/sqlite';

/**
 * Telefon numarasını normalize eder — sadece rakamlar, son 9 hane.
 * Ülke kodu farkı (handle "+905551234567" vs AB "(555) 765 43 21") için son 9 hane eşle.
 * Email handle (iMessage) ise rakam çıkmaz → '' döner (email path normalize edilmez).
 */
export function normalizePhone(value: string): string {
  return String(value).replace(/\D/g, '').slice(-9);
}

/**
 * AddressBook ABPerson + ABMultiValue (property=3 = telefon) join →
 * Map<normalizedPhone, "Ad Soyad">. Email lookup ayrı (lowercase email → name).
 *
 * Best-effort: db null veya tablo yoksa boş map döner (numara fallback).
 */
export function buildContactLookup(db: ReadOnlyDb | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!db) return map;

  try {
    // property=3 → telefon, property=4 → email. ABMultiValue.record_id → ABPerson.ROWID.
    const rows = db
      .prepare(
        `SELECT p.First AS first, p.Last AS last, p.Organization AS org,
                mv.value AS value, mv.property AS property
         FROM ABMultiValue mv
         JOIN ABPerson p ON p.ROWID = mv.record_id
         WHERE mv.property IN (3, 4) AND mv.value IS NOT NULL`,
      )
      .all() as Array<{
      first: string | null;
      last: string | null;
      org: string | null;
      value: string | null;
      property: number;
    }>;

    for (const r of rows) {
      const name = formatName(r.first, r.last, r.org);
      if (!name || !r.value) continue;

      if (r.property === 3) {
        const key = normalizePhone(r.value);
        if (key.length >= 7 && !map.has(key)) map.set(key, name);
      } else if (r.property === 4) {
        const key = r.value.trim().toLowerCase();
        if (key && !map.has(`email:${key}`)) map.set(`email:${key}`, name);
      }
    }
  } catch {
    // Tablo/şema farkı — sessiz fail, kısmi/boş map (numara fallback)
  }

  return map;
}

function formatName(first: string | null, last: string | null, org: string | null): string | null {
  const fn = (first ?? '').trim();
  const ln = (last ?? '').trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const o = (org ?? '').trim();
  return o || null;
}

/**
 * Bir handle (numara veya email) için kişi adı çözer.
 * Önce email eşleşmesi (handle '@' içeriyorsa), sonra son-9-hane telefon eşleşmesi.
 */
export function lookupContact(handle: string | null, lookup: Map<string, string>): string | null {
  if (!handle) return null;
  if (handle.includes('@')) {
    return lookup.get(`email:${handle.trim().toLowerCase()}`) ?? null;
  }
  const key = normalizePhone(handle);
  if (key.length < 7) return null;
  return lookup.get(key) ?? null;
}
