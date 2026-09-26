import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  listWaThread,
  clampWaThreadLimit,
  DEFAULT_WA_THREAD_LIMIT,
  MAX_WA_THREAD_LIMIT,
} from '@main/modules/whatsapp/listWaThread';
import type { WaThreadCursor } from '@shared/domain';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { computeFileId } from '@main/modules/manifest/fileId';
import { WA_DOMAIN } from '@main/modules/whatsapp/whatsappDb';
import { getTmpRoot } from '../../setup';
import { writeWhatsAppFixture, writeAddressBookFixture, SEC_C } from './whatsappFixture';

describe('listWaThread', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeWhatsAppFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('session 1 — 5 mesaj, tarih ASC', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    expect(res.total).toBe(5);
    expect(res.items[0]!.messageId).toBe(100); // SEC_A en eski
    expect(res.items[4]!.messageId).toBe(104); // en son eklenen
  });

  it('isFromMe ayrımı (ZISFROMME)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    expect(res.items[0]!.isFromMe).toBe(false); // gelen
    expect(res.items[1]!.isFromMe).toBe(true); // giden
  });

  it('ZMESSAGEDATE → appleSecondsToDate (SANİYE, 2017)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    expect(res.items[0]!.dateIso).toMatch(/^2017-/);
  });

  it('medya — fileId çözümü (AppDomainGroup shared)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    const withMedia = res.items.find((m) => m.messageId === 102)!;
    expect(withMedia.media).not.toBeNull();
    expect(withMedia.media!.kind).toBe('image');
    expect(withMedia.media!.fileId).toBe(
      computeFileId(WA_DOMAIN, 'Message/Media/905551234567@s.whatsapp.net/3/9/UUID/IMG_0001.jpg'),
    );
  });

  it('BUG 1 — ZMEDIALOCALPATH NULL + ZXMPPTHUMBPATH dolu → fileId XMPP thumb’dan', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    const thumbOnly = res.items.find((m) => m.messageId === 103)!;
    expect(thumbOnly.media).not.toBeNull();
    expect(thumbOnly.media!.isThumbnailOnly).toBe(true);
    // XMPP thumb `Media/...` → Message/ prefix ile çözülür (ZMEDIALOCALPATH ile aynı format)
    expect(thumbOnly.media!.fileId).toBe(
      computeFileId(
        WA_DOMAIN,
        'Message/Media/905551234567@s.whatsapp.net/d/c/THUMB_UUID/IMG_THUMB.jpg',
      ),
    );
  });

  it('BUG 1 — ikisi de NULL → media var ama fileId null (indirilmemiş)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    const notDownloaded = res.items.find((m) => m.messageId === 104)!;
    // mediaItem satırı var (mr) ama path yok → media objesi var, fileId null
    expect(notDownloaded.media!.fileId).toBeNull();
    expect(notDownloaded.media!.isThumbnailOnly).toBe(false);
  });

  it('BUG 1 — full media (ZMEDIALOCALPATH) varken isThumbnailOnly false', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    const full = res.items.find((m) => m.messageId === 102)!;
    expect(full.media!.isThumbnailOnly).toBe(false);
  });

  it('messageType WaMessage’a taşınır (sistem placeholder için)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    expect(res.items.find((m) => m.messageId === 100)!.messageType).toBe(0); // text
    expect(res.items.find((m) => m.messageId === 102)!.messageType).toBe(1); // image
  });

  it('media.title — ZTITLE alanı taşınır (yoksa null)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    const withMedia = res.items.find((m) => m.messageId === 102)!;
    expect(withMedia.media!.title).toBeNull(); // fixture ZTITLE null
  });

  it('grup mesajında gönderen adı (ZPUSHNAME)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 2 });
    const incoming = res.items.find((m) => m.messageId === 200)!;
    expect(incoming.isFromMe).toBe(false);
    expect(incoming.senderName).toBe('Mehmet K.'); // pushName öncelikli
    const outgoing = res.items.find((m) => m.messageId === 201)!;
    expect(outgoing.senderName).toBeNull(); // giden → gönderen adı yok
  });

  it('ChatStorage yoksa boş thread (crash değil)', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listWaThread({ udid: emptyUdid, rootPath, sessionId: 1 });
    expect(res).toEqual({ items: [], total: 0 });
  });
});

describe('listWaThread — keyset sayfalama', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeWhatsAppFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('ilk sayfa en yeni `limit` mesaj (ASC) + nextBefore; total tüm sohbet', async () => {
    const page1 = await listWaThread({ udid, rootPath, sessionId: 1, limit: 2 });
    expect(page1.total).toBe(5);
    // 102/103/104 aynı SEC_C — eşitlik Z_PK DESC ile kırılır → en yeni 2: 103, 104
    expect(page1.items.map((m) => m.messageId)).toEqual([103, 104]);
    expect(page1.nextBefore).toEqual({ date: SEC_C, messageId: 103 });
  });

  it('before imleciyle eskiler — aynı tarihli mesaj kaybolmaz/tekrarlanmaz', async () => {
    const seen: number[] = [];
    let before: WaThreadCursor | null = null;
    for (let i = 0; i < 10; i++) {
      const res = await listWaThread({ udid, rootPath, sessionId: 1, limit: 2, before });
      seen.unshift(...res.items.map((m) => m.messageId));
      if (!res.nextBefore) break;
      before = res.nextBefore;
    }
    expect(seen).toEqual([100, 101, 102, 103, 104]);
  });

  it('son sayfa limit’ten küçük → nextBefore null', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 2, limit: 5 });
    expect(res.items.map((m) => m.messageId)).toEqual([200, 201]);
    expect(res.nextBefore).toBeNull();
  });

  it('medya yalnız dönen sayfa için çözülür (sayfa içi medya korunur)', async () => {
    const page1 = await listWaThread({ udid, rootPath, sessionId: 1, limit: 2 });
    expect(page1.items.find((m) => m.messageId === 103)!.media!.isThumbnailOnly).toBe(true);
    const page2 = await listWaThread({
      udid,
      rootPath,
      sessionId: 1,
      limit: 2,
      before: page1.nextBefore,
    });
    expect(page2.items.map((m) => m.messageId)).toEqual([101, 102]);
    expect(page2.items.find((m) => m.messageId === 102)!.media!.kind).toBe('image');
  });

  it('limit verilmezse varsayılan sayfa (sınırsız sorgu yok)', async () => {
    const res = await listWaThread({ udid, rootPath, sessionId: 1 });
    expect(res.items).toHaveLength(5); // fixture < DEFAULT_WA_THREAD_LIMIT
    expect(res.nextBefore).toBeNull();
  });

  it('clampWaThreadLimit — null/NaN varsayılan, aralık dışı kırpılır', () => {
    expect(clampWaThreadLimit(undefined)).toBe(DEFAULT_WA_THREAD_LIMIT);
    expect(clampWaThreadLimit(null)).toBe(DEFAULT_WA_THREAD_LIMIT);
    expect(clampWaThreadLimit(Number.NaN)).toBe(DEFAULT_WA_THREAD_LIMIT);
    expect(clampWaThreadLimit(0)).toBe(1);
    expect(clampWaThreadLimit(-5)).toBe(1);
    expect(clampWaThreadLimit(12.7)).toBe(12);
    expect(clampWaThreadLimit(1e9)).toBe(MAX_WA_THREAD_LIMIT);
  });
});
