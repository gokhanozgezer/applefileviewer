import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { listWaConversations } from '@main/modules/whatsapp/listWaConversations';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { getTmpRoot } from '../../setup';
import { writeWhatsAppFixture, writeAddressBookFixture } from './whatsappFixture';

describe('listWaConversations', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeWhatsAppFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
  });

  it('boş sohbet elenir, son mesaj tarihine göre DESC', async () => {
    const res = await listWaConversations({ udid, rootPath });
    // session 3 (0 mesaj) elendi → 2 sohbet
    expect(res).toHaveLength(2);
    // session 1 son mesaj SEC_C (en yeni) → ilk; session 2 son mesaj SEC_B
    expect(res[0]!.sessionId).toBe(1);
    expect(res[1]!.sessionId).toBe(2);
  });

  it('ZPARTNERNAME NULL → AddressBook kişi adı (session 1)', async () => {
    const res = await listWaConversations({ udid, rootPath });
    const s1 = res.find((c) => c.sessionId === 1)!;
    expect(s1.contactName).toBe('Ahmet Yilmaz');
    expect(s1.displayName).toBe('Ahmet Yilmaz');
    expect(s1.contactJid).toBe('905551234567@s.whatsapp.net');
    expect(s1.isGroup).toBe(false);
  });

  it('grup tespiti — @g.us, ZPARTNERNAME displayName', async () => {
    const res = await listWaConversations({ udid, rootPath });
    const s2 = res.find((c) => c.sessionId === 2)!;
    expect(s2.isGroup).toBe(true);
    expect(s2.displayName).toBe('Aile Grubu');
  });

  it('ZMESSAGEDATE → appleSecondsToDate (SANİYE, 2017)', async () => {
    const res = await listWaConversations({ udid, rootPath });
    const s1 = res.find((c) => c.sessionId === 1)!;
    expect(s1.lastMessageDateIso).toMatch(/^2017-/);
  });

  it('son mesaj önizleme + sayım', async () => {
    const res = await listWaConversations({ udid, rootPath });
    const s1 = res.find((c) => c.sessionId === 1)!;
    // son mesaj (104, medya indirilmemiş) text NULL → preview boş
    expect(s1.lastMessagePreview).toBe('');
    expect(s1.messageCount).toBe(5);
    const s2 = res.find((c) => c.sessionId === 2)!;
    expect(s2.lastMessagePreview).toBe('Tamam');
    expect(s2.messageCount).toBe(2);
  });

  it('ChatStorage yoksa boş liste (crash değil)', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await listWaConversations({ udid: emptyUdid, rootPath });
    expect(res).toEqual([]);
  });
});
