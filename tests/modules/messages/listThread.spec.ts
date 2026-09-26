import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { listThread } from '@main/modules/messages/listThread';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { computeFileId } from '@main/modules/manifest/fileId';
import { getTmpRoot } from '../../setup';
import { writeSmsFixture, writeAddressBookFixture } from './messagesFixture';

describe('listThread', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeSmsFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('chat 1 — 3 mesaj, tarih ASC', async () => {
    const res = await listThread({ udid, rootPath, chatId: 10 });
    expect(res.total).toBe(3);
    expect(res.items[0]!.rowId).toBe(100); // NS_A en eski → ilk
    expect(res.items[2]!.rowId).toBe(102); // NS_C en yeni → son
  });

  it('is_from_me + service ayrımı', async () => {
    const res = await listThread({ udid, rootPath, chatId: 10 });
    expect(res.items[0]!.isFromMe).toBe(false);
    expect(res.items[0]!.service).toBe('iMessage');
    expect(res.items[1]!.isFromMe).toBe(true); // giden
  });

  it('message.date → appleNanosToDate (NANOSECOND, 2026)', async () => {
    const res = await listThread({ udid, rootPath, chatId: 10 });
    // NS_A 800010409096004000 → 2026-05
    expect(res.items[0]!.dateIso).toMatch(/^2026-/);
  });

  it('gelen mesaj handle + AddressBook kişi adı', async () => {
    const res = await listThread({ udid, rootPath, chatId: 10 });
    const incoming = res.items[0]!;
    expect(incoming.handle).toBe('+905551234567');
    expect(incoming.contactName).toBe('Ahmet Yilmaz');
  });

  it('attachment — fileId çözümü (MediaDomain)', async () => {
    const res = await listThread({ udid, rootPath, chatId: 10 });
    const withAtt = res.items.find((m) => m.rowId === 102)!;
    expect(withAtt.attachments).toHaveLength(1);
    const att = withAtt.attachments[0]!;
    expect(att.kind).toBe('image');
    expect(att.mimeType).toBe('image/heic');
    expect(att.fileId).toBe(
      computeFileId('MediaDomain', 'Library/SMS/Attachments/aa/bb/UUID/IMG_0001.HEIC'),
    );
  });

  it('sms.db yoksa boş thread (crash değil)', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listThread({ udid: emptyUdid, rootPath, chatId: 10 });
    expect(res).toEqual({ items: [], total: 0 });
  });

  it('keyset sayfalama: en yeni sayfa + before imleciyle eskiler', async () => {
    // İlk sayfa: en yeni 2 mesaj (ASC sırayla döner), imleç en eskisini gösterir
    const page1 = await listThread({ udid, rootPath, chatId: 10, limit: 2 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((m) => m.rowId)).toEqual([101, 102]); // yeni pencere, ASC
    expect(page1.nextBefore).not.toBeNull();

    // İkinci sayfa: imleçten öncesi — kalan en eski mesaj
    const page2 = await listThread({
      udid,
      rootPath,
      chatId: 10,
      limit: 2,
      before: page1.nextBefore,
    });
    expect(page2.items.map((m) => m.rowId)).toEqual([100]);
    // Sayfa limit'ten küçük → daha eski yok
    expect(page2.nextBefore).toBeNull();
  });

  it('sayfalama: ekler yalnız dönen sayfaya bağlanır', async () => {
    const page1 = await listThread({ udid, rootPath, chatId: 10, limit: 2 });
    const withAtt = page1.items.find((m) => m.rowId === 102);
    expect(withAtt?.attachments).toHaveLength(1);
  });

  it('limit verilmeyince tüm sohbet (geriye uyumluluk, nextBefore null)', async () => {
    const res = await listThread({ udid, rootPath, chatId: 10 });
    expect(res.items).toHaveLength(3);
    expect(res.nextBefore ?? null).toBeNull();
  });
});
