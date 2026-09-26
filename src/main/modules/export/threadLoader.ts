// threadLoader — dışa aktarma için TAM sohbeti main'de sayfa sayfa toplar.
// Renderer yalnız yüklenmiş sayfaları (en yeni 300…) tutar; export eskiden bunu
// gönderiyordu → sohbetin eski kısmı dosyaya hiç girmiyordu. Burada keyset imleciyle
// en yeniden en eskiye tüm sayfalar çekilir, kronolojik ASC sırada birleştirilir.

import { listThread, MAX_THREAD_LIMIT } from '@main/modules/messages/listThread';
import { listWaThread, MAX_WA_THREAD_LIMIT } from '@main/modules/whatsapp/listWaThread';
import type { Message, ThreadCursor, WaMessage, WaThreadCursor } from '@shared/domain';

/** Güvenlik sınırı — bozuk imleç döngüsüne karşı en fazla sayfa. */
const MAX_PAGES = 10_000;

interface ThreadRef {
  udid: string;
  rootPath: string;
}

/** Sayfaları (en yeni → en eski sırasıyla gelen) kronolojik ASC listeye çevirir. */
function flattenNewestFirst<T>(pages: T[][]): T[] {
  const out: T[] = [];
  for (let i = pages.length - 1; i >= 0; i--) for (const m of pages[i]!) out.push(m);
  return out;
}

/** SMS/iMessage sohbetinin tüm mesajları (ASC). */
export async function loadFullMessageThread(
  ref: ThreadRef & { chatId: number },
  pageSize = MAX_THREAD_LIMIT,
): Promise<Message[]> {
  const pages: Message[][] = [];
  let before: ThreadCursor | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await listThread({ ...ref, limit: pageSize, before });
    pages.push(res.items);
    if (!res.nextBefore) break;
    before = res.nextBefore;
  }
  return flattenNewestFirst(pages);
}

/** WhatsApp sohbetinin tüm mesajları (ASC). */
export async function loadFullWaThread(
  ref: ThreadRef & { sessionId: number },
  pageSize = MAX_WA_THREAD_LIMIT,
): Promise<WaMessage[]> {
  const pages: WaMessage[][] = [];
  let before: WaThreadCursor | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await listWaThread({ ...ref, limit: pageSize, before });
    pages.push(res.items);
    if (!res.nextBefore) break;
    before = res.nextBefore;
  }
  return flattenNewestFirst(pages);
}
