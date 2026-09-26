import path from 'node:path';
import { openContactsDb } from './contactsDb';
import { appleSecondsToDate } from '@main/util/appleEpoch';
import type { Contact, ContactsRequest } from '@shared/domain';

interface PersonRow {
  id: number;
  first: string | null;
  last: string | null;
  middle: string | null;
  organization: string | null;
  jobTitle: string | null;
  nickname: string | null;
  note: string | null;
  birthday: number | null;
}

interface MultiValueRow {
  record_id: number;
  property: number;
  value: string | null;
}

/**
 * ABPerson.Birthday Apple epoch SANİYE (FLOAT) → ISO. Null/geçersiz → null.
 */
function birthdayIso(raw: number | null): string | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  try {
    return appleSecondsToDate(raw).toISOString();
  } catch {
    return null;
  }
}

/**
 * displayName öncelik sırası: "First Last" → Organization → Nickname → '?'.
 * First/Last boşsa organizasyona, o da boşsa nickname'e düş.
 */
function buildDisplayName(r: PersonRow): string {
  const full = `${(r.first ?? '').trim()} ${(r.last ?? '').trim()}`.trim();
  if (full) return full;
  const org = (r.organization ?? '').trim();
  if (org) return org;
  const nick = (r.nickname ?? '').trim();
  if (nick) return nick;
  return '?';
}

/**
 * ABPerson → Contact[]. Her kişi için ABMultiValue (property 3/4/5) join ile
 * telefon/email/adres gruplanır.
 *
 * - Alfabetik sıralama: COALESCE(FirstSort, First) COLLATE NOCASE (yoksa LastSort fallback).
 * - ABMultiValue tek sorgu (293 kişi × birkaç değer, hafif) → record_id ile grupla.
 * - property 3=telefon, 4=email, 5=adres. Adres ABMultiValueEntry'de düzleştirilir
 *   (sokak/şehir/ülke), yoksa ABMultiValue.value.
 *
 * Boş tablo / tablo yok / şema farkı → try/catch → [] (crash değil).
 */
export async function listContacts(req: ContactsRequest): Promise<Contact[]> {
  const backupRoot = path.join(req.rootPath, req.udid);
  const db = await openContactsDb(req.udid, backupRoot);
  if (!db) return []; // AddressBook.sqlitedb yok — boş

  try {
    const persons = db
      .prepare(
        `SELECT
           ROWID        AS id,
           First        AS first,
           Last         AS last,
           Middle       AS middle,
           Organization AS organization,
           JobTitle     AS jobTitle,
           Nickname     AS nickname,
           Note         AS note,
           Birthday     AS birthday
         FROM ABPerson
         ORDER BY
           COALESCE(NULLIF(TRIM(FirstSort), ''), First, Organization, Nickname) COLLATE NOCASE ASC,
           COALESCE(NULLIF(TRIM(LastSort), ''), Last) COLLATE NOCASE ASC`,
      )
      .all() as PersonRow[];

    // Tüm ABMultiValue tek sorgu — record_id ile grupla (telefon/email/adres).
    const multi = db
      .prepare(
        `SELECT record_id, property, value
         FROM ABMultiValue
         WHERE property IN (3, 4, 5) AND value IS NOT NULL`,
      )
      .all() as MultiValueRow[];

    const phonesBy = new Map<number, string[]>();
    const emailsBy = new Map<number, string[]>();
    const addressesBy = new Map<number, string[]>();

    for (const m of multi) {
      const value = (m.value ?? '').trim();
      if (!value) continue;
      const target = m.property === 3 ? phonesBy : m.property === 4 ? emailsBy : addressesBy;
      const arr = target.get(m.record_id);
      if (arr) arr.push(value);
      else target.set(m.record_id, [value]);
    }

    return persons.map((r) => ({
      id: r.id,
      displayName: buildDisplayName(r),
      firstName: (r.first ?? '').trim() || null,
      lastName: (r.last ?? '').trim() || null,
      organization: (r.organization ?? '').trim() || null,
      jobTitle: (r.jobTitle ?? '').trim() || null,
      note: (r.note ?? '').trim() || null,
      birthdayIso: birthdayIso(r.birthday),
      phones: phonesBy.get(r.id) ?? [],
      emails: emailsBy.get(r.id) ?? [],
      addresses: addressesBy.get(r.id) ?? [],
    }));
  } catch {
    // ABPerson/ABMultiValue yok veya şema farkı — boş liste (crash değil)
    return [];
  } finally {
    db.close();
  }
}
