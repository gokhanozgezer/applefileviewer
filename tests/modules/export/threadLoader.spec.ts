import { describe, it, expect, beforeEach } from 'vitest';
import { loadFullMessageThread, loadFullWaThread } from '@main/modules/export/threadLoader';
import {
  clampThreadLimit,
  DEFAULT_THREAD_LIMIT,
  MAX_THREAD_LIMIT,
} from '@main/modules/messages/listThread';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { getTmpRoot } from '../../setup';
import {
  writeSmsFixture,
  writeAddressBookFixture as writeSmsAddressBook,
} from '../messages/messagesFixture';
import { writeWhatsAppFixture } from '../whatsapp/whatsappFixture';

describe('threadLoader — export için tam sohbet', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    rootPath = getTmpRoot();
    writeSmsFixture(rootPath, udid);
    writeSmsAddressBook(rootPath, udid);
    writeWhatsAppFixture(rootPath, udid);
  });

  it('Messages: sayfa boyutundan bağımsız tüm mesajlar, kronolojik ASC', async () => {
    for (const size of [1, 2, 100]) {
      const all = await loadFullMessageThread({ udid, rootPath, chatId: 10 }, size);
      expect(all.map((m) => m.rowId)).toEqual([100, 101, 102]);
    }
  });

  it('WhatsApp: çok sayfalı (aynı tarihli mesajlar dahil) tam liste ASC', async () => {
    for (const size of [1, 2, 3, 100]) {
      const all = await loadFullWaThread({ udid, rootPath, sessionId: 1 }, size);
      expect(all.map((m) => m.messageId)).toEqual([100, 101, 102, 103, 104]);
    }
  });

  it('veritabanı yoksa boş dizi', async () => {
    const other = 'c'.repeat(40);
    expect(await loadFullMessageThread({ udid: other, rootPath, chatId: 10 })).toEqual([]);
    expect(await loadFullWaThread({ udid: other, rootPath, sessionId: 1 })).toEqual([]);
  });
});

describe('clampThreadLimit (listThread sınırsız sorgu düzeltmesi)', () => {
  it('null/undefined/NaN → varsayılan sayfa; aralık dışı kırpılır', () => {
    expect(clampThreadLimit(undefined)).toBe(DEFAULT_THREAD_LIMIT);
    expect(clampThreadLimit(null)).toBe(DEFAULT_THREAD_LIMIT);
    expect(clampThreadLimit(Number.NaN)).toBe(DEFAULT_THREAD_LIMIT);
    expect(clampThreadLimit(Infinity)).toBe(DEFAULT_THREAD_LIMIT);
    expect(clampThreadLimit(0)).toBe(1);
    expect(clampThreadLimit(299.9)).toBe(299);
    expect(clampThreadLimit(10_000_000)).toBe(MAX_THREAD_LIMIT);
  });
});
