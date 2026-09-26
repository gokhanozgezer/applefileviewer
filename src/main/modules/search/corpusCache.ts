// corpusCache — domain başına katlanmış arama korpusu, bellek-içi LRU.
//
// Anahtar, açılan tmp snapshot'ın dosya yolu (db.name) — util/sqlite bunu
// sha1(udid|kaynak|mtime) ile adlandırır; yani anahtar kendiliğinden mtime'a bağlı:
// yedek yenilenirse yeni anahtar, eski girdi LRU ile düşer. Aynı yedekte ardışık
// tuş vuruşları korpusu yeniden kurmaz (attributedBody decode / not gövdesi gzip
// yalnız ilk aramada).
//
// Bellek sınırı: satırın TUTTUĞU tüm string'lerin karakter toplamı üzerinden bütçe —
// katlanmış `f` + üst verideki ham alanlar (not `body`, sesli mesaj `transcript`…).
// Eskiden yalnız `f` sayılıyordu: not gövdesi iki kez (katlanmış + ham) tutulurken
// bütçe yarısını görüyordu. Bütçeyi tek başına aşan korpus önbelleğe alınmaz
// (yine döner, sadece saklanmaz).
//
// BİRİM: "karakter" = JS string uzunluğu (UTF-16 code unit). V8 bellekte Latin-1
// string'i 1, diğerlerini 2 bayt/karakter tutar → bayt karşılığı ≈ 1–2 × karakter.

export interface CorpusRow<M> {
  /** foldText ile katlanmış aranabilir metin. */
  f: string;
  /** Domain'e özgü üst veri (id, tarih, başlık…). */
  m: M;
}

interface Entry {
  rows: CorpusRow<unknown>[];
  cost: number;
}

/** Bütçe — BİRİM: UTF-16 karakter (≈ 40–80 MB; 1–2 bayt/karakter). */
export const CORPUS_MAX_CHARS = 40_000_000;
const CORPUS_MAX_ENTRIES = 16;
const ROW_OVERHEAD = 32; // satır nesnesi + sayısal üst veri için kaba karakter-eşdeğeri

const cache = new Map<string, Entry>();
let totalCost = 0;

/** Üst verinin tuttuğu string karakterleri (sığ: string alanlar + string dizileri). */
function metaChars(m: unknown): number {
  if (typeof m === 'string') return m.length;
  if (m === null || typeof m !== 'object') return 0;
  let c = 0;
  for (const v of Object.values(m as Record<string, unknown>)) {
    if (typeof v === 'string') c += v.length;
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') c += x.length;
  }
  return c;
}

/** Korpus maliyeti — BİRİM: UTF-16 karakter (katlanmış f + üst verideki ham string'ler). */
export function corpusCostOf(rows: readonly CorpusRow<unknown>[]): number {
  let c = 0;
  for (const r of rows) c += r.f.length + metaChars(r.m) + ROW_OVERHEAD;
  return c;
}

/**
 * Anahtara karşılık korpusu döndürür; yoksa `build` ile kurar ve (bütçeye
 * sığıyorsa) saklar. LRU: erişilen girdi en sona taşınır.
 */
export function getCorpus<M>(
  key: string,
  build: () => CorpusRow<M>[],
  maxChars = CORPUS_MAX_CHARS,
): CorpusRow<M>[] {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.rows as CorpusRow<M>[];
  }
  const rows = build();
  const cost = corpusCostOf(rows as CorpusRow<unknown>[]);
  if (cost > maxChars) return rows; // tek başına bütçeyi aşıyor — saklama
  while (cache.size > 0 && (totalCost + cost > maxChars || cache.size >= CORPUS_MAX_ENTRIES)) {
    const oldestKey = cache.keys().next().value as string;
    totalCost -= cache.get(oldestKey)!.cost;
    cache.delete(oldestKey);
  }
  cache.set(key, { rows: rows as CorpusRow<unknown>[], cost });
  totalCost += cost;
  return rows;
}

/**
 * Katlanmış iğneleri korpusta tara (herhangi biri eşleşirse satır döner);
 * ilk `limit` eşleşme, korpus sırası korunur (korpuslar en yeni önce kurulur).
 */
export function scanCorpus<M>(
  rows: CorpusRow<M>[],
  needles: readonly string[],
  limit: number,
): CorpusRow<M>[] {
  const out: CorpusRow<M>[] = [];
  const list = needles.filter((n) => n.length > 0);
  if (list.length === 0) return out;
  for (const r of rows) {
    if (list.some((n) => r.f.includes(n))) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Anahtarı `pred`i sağlayan girdileri düşürür. Şifreli yedek kilitlenince o oturumun
 * çözülmüş DB yollarını (anahtar = `<domain>|<db.name>`) içeren korpuslar bellekte
 * kalmasın diye çağrılır. Döner: düşürülen girdi sayısı.
 */
export function purgeCorpus(pred: (key: string) => boolean): number {
  let removed = 0;
  for (const [key, entry] of [...cache]) {
    if (!pred(key)) continue;
    cache.delete(key);
    totalCost -= entry.cost;
    removed += 1;
  }
  return removed;
}

/** Test yardımcısı — önbellek durumunu sıfırla / incele. */
export function _resetCorpusCacheForTest(): void {
  cache.clear();
  totalCost = 0;
}

export function _corpusCacheStatsForTest(): { entries: number; totalCost: number } {
  return { entries: cache.size, totalCost };
}
