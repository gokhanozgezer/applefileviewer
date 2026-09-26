// pdfPolicy — PDF export penceresinin güvenlik politikası (saf, Electron import ETMEZ).
// ipc/export.ts#htmlToPdf bu sabitleri BrowserWindow/session'a uygular; burada
// tutulmaları test edilebilir olmaları için (Electron'suz vitest).
//
// Tehdit: export HTML'i yedekten gelen GÜVENİLMEZ metin taşır (mesaj, not, kişi adı).
// esc() ile kaçışlanıyor ama savunma derinliği için render penceresi: JS kapalı,
// sandbox, izole bellek-içi session, ağ isteği yok, navigasyon/pencere açma yok.

/**
 * Üretilen tüm export HTML'lerine gömülen CSP — dışarı istek (img/css/font/fetch),
 * script ve form gönderimi yasak; yalnız inline stil ve data: görsel serbest.
 */
export const EXPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

/** HTML <head> içine konacak CSP meta etiketi. */
export const EXPORT_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}" />`;

/** Bellek-içi (persist: öneki YOK) izole session — çerez/cache diske yazılmaz. */
export const PDF_PARTITION = 'afv-export-pdf';

/**
 * PDF belgesinin yüklendiği session-içi özel şema. data: URL Chromium'da ~2 MB
 * URL sınırına takılıyordu (tam sohbet export'u bunu rahatça aşar); HTML bellekte
 * tutulur ve yalnız bu session'a kayıtlı handler'dan servis edilir.
 */
export const PDF_SCHEME = 'afv-pdf';

/** Belge id'si → yüklenecek URL. */
export function pdfDocUrl(id: string): string {
  return `${PDF_SCHEME}://doc/${encodeURIComponent(id)}`;
}

/** pdfDocUrl'ün tersi — geçersizse null. */
export function pdfDocIdFromUrl(url: string): string | null {
  const prefix = `${PDF_SCHEME}://doc/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length).split(/[?#]/)[0] ?? '';
  try {
    const id = decodeURIComponent(rest);
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** loadURL + printToPDF için üst süre (büyük sohbetlerde de takılı pencere kalmasın). */
export const PDF_TIMEOUT_MS = 120_000;

/** PDF render penceresinin webPreferences'ı. */
export function pdfWebPreferences() {
  return {
    sandbox: true,
    javascript: false,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    webSecurity: true,
    webviewTag: false,
    spellcheck: false,
    partition: PDF_PARTITION,
  } as const;
}

/**
 * PDF session'ında izin verilen istek: yalnız afv-pdf://doc/ belgesi ve gömülü
 * data: kaynakları. http(s)/file/ws/backup:// vb. her şey iptal.
 */
export function isAllowedPdfRequest(url: string): boolean {
  return url.startsWith('data:') || pdfDocIdFromUrl(url) !== null;
}

/**
 * Promise'i süre sınırıyla yarıştırır; süre dolarsa `label` içeren hata fırlatır.
 * Zamanlayıcı her iki yolda da temizlenir (açık handle kalmaz).
 */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: zaman aşımı (${ms} ms)`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
