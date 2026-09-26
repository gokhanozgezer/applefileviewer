import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { listConversations } from '@main/modules/messages/listConversations';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { getTmpRoot } from '../../setup';
import { writeSmsFixture, writeAddressBookFixture } from './messagesFixture';

describe('listConversations', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeSmsFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('boş sohbet elenir, son mesaj tarihine göre DESC', async () => {
    const res = await listConversations({ udid, rootPath });
    // chat 30 (0 mesaj) elendi → 2 sohbet
    expect(res).toHaveLength(2);
    // chat 1 son mesaj NS_C (en yeni) → ilk; chat 2 son mesaj NS_B
    expect(res[0]!.chatId).toBe(10);
    expect(res[1]!.chatId).toBe(20);
  });

  it('display_name NULL → AddressBook kişi adı (chat 1)', async () => {
    const res = await listConversations({ udid, rootPath });
    const chat1 = res.find((c) => c.chatId === 10)!;
    expect(chat1.contactName).toBe('Ahmet Yilmaz');
    expect(chat1.displayName).toBe('Ahmet Yilmaz'); // kişi adı fallback
    expect(chat1.identifier).toBe('+905551234567');
  });

  it('dominant service — chat 1 iMessage, chat 2 SMS', async () => {
    const res = await listConversations({ udid, rootPath });
    expect(res.find((c) => c.chatId === 10)!.dominantService).toBe('iMessage');
    expect(res.find((c) => c.chatId === 20)!.dominantService).toBe('SMS');
  });

  it('son mesaj önizleme + sayım', async () => {
    const res = await listConversations({ udid, rootPath });
    const chat1 = res.find((c) => c.chatId === 10)!;
    expect(chat1.lastMessagePreview).toBe('Iyiyim tesekkurler');
    expect(chat1.messageCount).toBe(3);
    expect(chat1.lastMessageDateIso).not.toBeNull();
  });

  it('AddressBook eşleşmeyen → identifier fallback', async () => {
    const res = await listConversations({ udid, rootPath });
    const chat2 = res.find((c) => c.chatId === 20)!;
    expect(chat2.contactName).toBeNull();
    expect(chat2.displayName).toBe('+905001112233');
  });

  it('sms.db yoksa boş liste (crash değil)', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listConversations({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });
});
