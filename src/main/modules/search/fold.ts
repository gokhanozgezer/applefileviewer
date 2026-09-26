// fold — arama için metin katlama (case + aksan). UZUNLUK KORUYAN: fold(s).length ===
// s.length ve i. karakter i. karakterin katlanmış hâli. Böylece katlanmış metinde
// bulunan indeks orijinal metinde de geçerli — snippet/vurgu hesabı ayrıca eşleme
// tablosu gerektirmez.
//
// Kurallar:
// - Türkçe: İ/I/ı → i (hem 'ışık' hem 'ISIK' hem 'Işık' aynı katlanır).
// - Aksan: NFD + birleşik işaret silme (ş→s, ğ→g, ü→u, é→e …).
// - Boşluk benzeri karakterler (\n, \t, NBSP) → ' '.
// - Tek karaktere inmeyen dönüşümler (ör. 'ﬁ' ligatürü) olduğu gibi kalır.

const WS_RE = /\s/;
const MARKS_RE = /[̀-ͯ]/g;

// ASCII dışı karakter → katlanmış karakter önbelleği (sınırlı alfabe, küçük kalır).
const charCache = new Map<string, string>();

function foldNonAscii(c: string): string {
  const hit = charCache.get(c);
  if (hit !== undefined) return hit;
  let out: string;
  if (c === 'İ' || c === 'ı') {
    out = 'i';
  } else if (WS_RE.test(c)) {
    out = ' ';
  } else {
    const stripped = c.normalize('NFD').replace(MARKS_RE, '').toLowerCase();
    if (stripped.length === 1) {
      out = stripped;
    } else {
      const lower = c.toLowerCase();
      out = lower.length === 1 ? lower : c;
    }
  }
  if (charCache.size < 4096) charCache.set(c, out);
  return out;
}

/** Uzunluk koruyan katlama (bkz. dosya başı). */
export function foldText(s: string): string {
  let out = '';
  let changed = false;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let f: string;
    if (code < 0x80) {
      if (code >= 0x41 && code <= 0x5a) f = String.fromCharCode(code + 32);
      else if (code === 0x09 || code === 0x0a || code === 0x0d) f = ' ';
      else f = s[i]!;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      f = s[i]!; // surrogate yarısı — emoji vb. olduğu gibi
    } else {
      f = foldNonAscii(s[i]!);
    }
    if (!changed && f !== s[i]) {
      changed = true;
      out = s.slice(0, i);
    }
    if (changed) out += f;
  }
  return changed ? out : s;
}

export interface Snippet {
  snippet: string;
  /** snippet içindeki eşleşme aralığı; eşleşme yoksa undefined. */
  match?: { start: number; length: number };
}

/**
 * Eşleşme çevresinden pencere kes (UI satırı için). `foldedQuery` foldText ile
 * katlanmış sorgu olmalı. Boşluklar tek boşluğa indirilir (satır görünümü).
 */
export function buildSnippet(text: string, foldedQuery: string, radius = 40): Snippet {
  const clean = text.replace(/\s+/g, ' ').trim();
  const idx = foldedQuery ? foldText(clean).indexOf(foldedQuery) : -1;
  if (idx < 0) {
    const cut = clean.slice(0, radius * 2);
    return { snippet: cut.length < clean.length ? `${cut}…` : cut };
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + foldedQuery.length + radius);
  const prefix = start > 0 ? '…' : '';
  return {
    snippet: `${prefix}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`,
    match: { start: prefix.length + idx - start, length: foldedQuery.length },
  };
}

/** Kısa metin (başlık) içinde eşleşme aralığı — yoksa undefined. */
export function findMatch(
  text: string,
  foldedQuery: string,
): { start: number; length: number } | undefined {
  if (!foldedQuery) return undefined;
  const idx = foldText(text).indexOf(foldedQuery);
  return idx < 0 ? undefined : { start: idx, length: foldedQuery.length };
}
