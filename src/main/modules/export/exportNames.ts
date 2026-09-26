// exportNames — dışa aktarma dosya adı/istek doğrulama yardımcıları (saf, fs DOKUNMAZ).
// IPC katmanı (ipc/export.ts) Electron'a bağlı olduğu için doğrulama mantığı burada
// tutulur → unit test edilebilir. Dosya varlığı kontrolü callback ile enjekte edilir.

/** Dosya adı üst sınırı (uzantı dahil) — Windows MAX_PATH payı için 120. */
export const MAX_NAME_LENGTH = 120;

/** copyMediaBatch tek istekte kabul edilen en fazla öğe (renderer DoS/yanlış kullanım koruması). */
export const MAX_BATCH_ITEMS = 50_000;

// Windows ayrılmış aygıt adları — uzantılı hali de (NUL.txt) ayrılmış sayılır.
// COM¹/²/³ ve LPT¹/²/³ de Windows tarafından aygıt adı olarak yorumlanır.
const RESERVED_RE = /^(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])$/i;

// Windows yasak karakterleri + kontrol karakterleri (0x00-0x1F, 0x7F).
// eslint-disable-next-line no-control-regex
const FORBIDDEN_RE = /[\\/:*?"<>|\x00-\x1f\x7f]+/g;

/** Sondaki nokta/boşlukları at (Windows bunları sessizce kırpar → farklı dosyaya yazılır). */
function stripTrailing(s: string): string {
  return s.replace(/[. ]+$/, '');
}

/**
 * Kullanıcı/veri kaynaklı adı güvenli tek dosya adına çevirir:
 * yasak/kontrol karakterleri '_', boşluklar tekilleşir, sondaki nokta/boşluk atılır,
 * '.'/'..' ve boş sonuç `fallback`'e düşer, Windows ayrılmış adları '_' önekiyle
 * etkisizleşir, uzunluk MAX_NAME_LENGTH'e (uzantı korunarak) kırpılır.
 */
export function sanitizeName(name: unknown, fallback = 'export'): string {
  if (typeof name !== 'string') return fallback;
  // Önce boşluk sınıfı (\n, \t dahil) tek boşluğa; kalan kontrol karakterleri '_'.
  let cleaned = stripTrailing(name.replace(/\s+/g, ' ').replace(FORBIDDEN_RE, '_').trim());
  // Yalnız noktalardan oluşan ad ('.', '..', '...') — dizin geçişi / geçersiz ad.
  if (cleaned.length === 0 || /^\.+$/.test(cleaned)) return fallback;

  // Ayrılmış ad kontrolü uzantısız köke göre (CON.txt, nul.tar.gz da ayrılmış).
  const stem = cleaned.split('.')[0]!.trim();
  if (RESERVED_RE.test(stem)) cleaned = `_${cleaned}`;

  if (cleaned.length > MAX_NAME_LENGTH) {
    const dot = cleaned.lastIndexOf('.');
    const ext = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : '';
    const base = stripTrailing(cleaned.slice(0, MAX_NAME_LENGTH - ext.length).trimEnd());
    cleaned = base.length > 0 ? `${base}${ext}` : fallback;
  }
  return cleaned;
}

/**
 * Ad çakışmasında " (2)", " (3)"… eki üretir — sessiz üzerine yazma yok.
 * `seen` aynı istek içindeki adları (küçük harf) tutar ve güncellenir;
 * `exists` hedef klasörde dosya var mı (IPC katmanı existsSync ile verir).
 */
export function uniqueFileName(
  name: string,
  seen: Set<string>,
  exists: (candidate: string) => boolean,
): string {
  const taken = (n: string) => seen.has(n.toLowerCase()) || exists(n);
  let out = name;
  if (taken(out)) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot) : '';
    const base = name.slice(0, name.length - ext.length);
    let n = 2;
    while (taken(`${base} (${n})${ext}`)) n++;
    out = `${base} (${n})${ext}`;
  }
  seen.add(out.toLowerCase());
  return out;
}

export interface BatchItem {
  fileId: string;
  suggestedName: string;
}

/**
 * copyMediaBatch `items` doğrulaması — dizi değilse / boşsa / sınırı aşıyorsa
 * hata mesajı döner (throw DEĞİL: IPC sonucu şekli korunur). Tek tek öğe
 * doğrulaması (fileId hex, ad string) kopya döngüsünde öğe bazlı yapılır.
 */
export function validateBatchItems(items: unknown): string | null {
  if (!Array.isArray(items)) return 'items bir dizi olmalı';
  if (items.length === 0) return 'Dışa aktarılacak öğe yok';
  if (items.length > MAX_BATCH_ITEMS) {
    return `Çok fazla öğe: ${items.length} (en fazla ${MAX_BATCH_ITEMS})`;
  }
  return null;
}

/** Tek batch öğesinin şekli (fileId + suggestedName string) doğru mu. */
export function isBatchItem(item: unknown): item is BatchItem {
  if (typeof item !== 'object' || item === null) return false;
  const rec = item as Record<string, unknown>;
  return typeof rec['fileId'] === 'string' && typeof rec['suggestedName'] === 'string';
}
