import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  globalSearch,
  escapeLike,
  makeSnippet,
  normalizeQuery,
  phoneDigits,
} from '@main/modules/search/globalSearch';
import {
  _resetCorpusCacheForTest,
  _corpusCacheStatsForTest,
} from '@main/modules/search/corpusCache';
import { _resetTmpCacheForTest } from '@main/util/sqlite';
import { getTmpRoot } from '../../setup';
import { writeSmsFixture, writeAddressBookFixture } from '../messages/messagesFixture';
import { writeWhatsAppFixture } from '../whatsapp/whatsappFixture';
import { writeNotesFixture } from '../notes/notesFixture';
import { writeCallsFixture } from '../calls/callsFixture';
import { writeVoicemailFixture } from '../voicemail/voicemailFixture';
import { writeVoiceMemosFixture } from '../voicememos/voiceMemosFixture';
import {
  addSearchMessages,
  addSearchContacts,
  writeSearchPhotosFixture,
  writeBrokenCallsFixture,
} from './searchFixture';

describe('escapeLike', () => {
  it('joker karakterleri kaçırır', () => {
    expect(escapeLike('%50_a\\b')).toBe('\\%50\\_a\\\\b');
    expect(escapeLike('normal')).toBe('normal');
  });
});

describe('makeSnippet', () => {
  it('eşleşme çevresinden pencere keser', () => {
    const text = 'a'.repeat(100) + ' hedef kelime ' + 'b'.repeat(100);
    const snip = makeSnippet(text, 'hedef');
    expect(snip).toContain('hedef');
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip.length).toBeLessThan(120);
  });

  it('kısa metin olduğu gibi döner', () => {
    expect(makeSnippet('merhaba dünya', 'dünya')).toBe('merhaba dünya');
  });
});

describe('normalizeQuery / phoneDigits', () => {
  it('tip + uzunluk doğrulaması (2..200, kırpılmış)', () => {
    expect(normalizeQuery(42)).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
    expect(normalizeQuery('  a  ')).toBeNull();
    expect(normalizeQuery('  ab  ')).toBe('ab');
    expect(normalizeQuery('x'.repeat(200))).toHaveLength(200);
    expect(normalizeQuery('x'.repeat(201))).toBeNull();
  });

  it('numara benzeri sorgudan rakamlar', () => {
    expect(phoneDigits('(542) 365')).toBe('542365');
    expect(phoneDigits('+90 542')).toBe('90542');
    expect(phoneDigits('12')).toBeNull(); // 3'ten az rakam
    expect(phoneDigits('ahmet 5')).toBeNull();
  });
});

describe('globalSearch', () => {
  let rootPath: string;
  const udid = 'a'.repeat(40);

  beforeEach(() => {
    _resetTmpCacheForTest();
    _resetCorpusCacheForTest();
    rootPath = getTmpRoot();
    writeSmsFixture(rootPath, udid);
    writeAddressBookFixture(rootPath, udid);
    addSearchMessages(rootPath, udid);
    addSearchContacts(rootPath, udid);
    writeWhatsAppFixture(rootPath, udid);
    writeNotesFixture(rootPath, udid);
    writeCallsFixture(rootPath, udid);
    writeVoicemailFixture(rootPath, udid);
    writeVoiceMemosFixture(rootPath, udid);
    writeSearchPhotosFixture(rootPath, udid);
  });

  const byDomain = async (query: string, domain: string) =>
    (await globalSearch({ udid, rootPath, query })).hits.filter((h) => h.domain === domain);

  it('2 karakterden kısa / 200 üstü / string olmayan sorgu boş döner', async () => {
    expect((await globalSearch({ udid, rootPath, query: 'a' })).hits).toEqual([]);
    expect((await globalSearch({ udid, rootPath, query: 'x'.repeat(201) })).hits).toEqual([]);
    const bad = { udid, rootPath, query: 123 as unknown as string };
    expect((await globalSearch(bad)).hits).toEqual([]);
  });

  it('mesaj metninde arama — chatId + kişi adı başlığı + vurgu aralığı', async () => {
    const hits = await byDomain('merhaba', 'messages');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.chatId).toBe(10);
    expect(hits[0]!.title).toBe('Ahmet Yilmaz'); // AddressBook çözümü
    const m = hits[0]!.snippetMatch!;
    expect(hits[0]!.snippet.slice(m.start, m.start + m.length)).toBe('Merhaba');
    expect(hits[0]!.dateIso).toMatch(/^\d{4}-/);
  });

  it('text NULL + attributedBody mesajı bulunur (iOS 16+)', async () => {
    const hits = await byDomain('toplantı', 'messages');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.snippet).toContain('ŞİRKET toplantısı');
  });

  it('Türkçe büyük/küçük harf + aksan duyarsız (İ/ı/Ş)', async () => {
    expect(await byDomain('şirket', 'messages')).toHaveLength(1);
    expect(await byDomain('sirket', 'messages')).toHaveLength(1);
    expect(await byDomain('ışık', 'messages')).toHaveLength(1);
    expect(await byDomain('isik', 'messages')).toHaveLength(1);
    const c = await byDomain('ŞULE', 'contacts');
    expect(c).toHaveLength(1);
    expect(c[0]!.title).toBe('Şule Güneş');
    expect(c[0]!.titleMatch).toEqual({ start: 0, length: 4 });
  });

  it('WhatsApp metninde arama — sessionId döner', async () => {
    const hits = await byDomain('NASILSIN', 'whatsapp');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.sessionId).toBe(1);
    expect(hits[0]!.snippet).toBe('Selam nasilsin');
    expect(hits[0]!.snippetMatch).toEqual({ start: 6, length: 8 });
  });

  it('notlar: gövde + klasör adı aranır, silinenler hariç', async () => {
    const body = await byDomain('ğüşıöç', 'notes');
    expect(body.map((h) => h.noteId)).toEqual([2]);
    expect(body[0]!.snippetMatch).toBeDefined();

    const folder = await byDomain('notlar', 'notes');
    expect(folder.map((h) => h.noteId).sort()).toEqual([1, 2]);

    // Recently Deleted klasöründeki (4) ve ZMARKEDFORDELETION (5) notlar bulunmaz
    expect(await byDomain('silin', 'notes')).toEqual([]);
    expect(await byDomain('işaretli', 'notes')).toEqual([]);
  });

  it('kişiler: ad, e-posta ve rakam-bazlı numara araması', async () => {
    const byName = await byDomain('ahmet', 'contacts');
    expect(byName[0]!.contactId).toBe(1);
    const byMail = await byDomain('example.com', 'contacts');
    expect(byMail.map((h) => h.contactId)).toEqual([2]);
    expect(byMail[0]!.snippet).toContain('sule@example.com');
    // AB '(555) 123 45 67' — biçimsiz rakamlarla da bulunur
    const byDigits = await byDomain('5551234567', 'contacts');
    expect(byDigits.map((h) => h.contactId)).toEqual([1]);
  });

  it('aramalar: kişi adı ve numara ile', async () => {
    const byName = await byDomain('yilmaz', 'calls');
    expect(byName.map((h) => h.itemId).sort()).toEqual([10, 12]);
    expect(byName[0]!.title).toBe('Ahmet Yilmaz');
    // en yeni önce
    expect(byName[0]!.itemId).toBe(12);
    const byNumber = await byDomain('5999998877', 'calls');
    expect(byNumber.map((h) => h.itemId)).toEqual([13]);
  });

  it('sesli mesaj: gönderen numarası, silinen hariç', async () => {
    const hits = await byDomain('+90500', 'voicemail');
    expect(hits.map((h) => h.itemId)).toEqual([11]);
    expect(hits[0]!.dateIso).toBe(new Date(1_600_000_100 * 1000).toISOString());
    expect(await byDomain('5111111111', 'voicemail')).toEqual([]); // trashed
  });

  it('ses kayıtları: etiket (Türkçe) ve dosya adı', async () => {
    const label = await byDomain('ilk kayit', 'voicememos');
    expect(label.map((h) => h.itemId)).toEqual([1]);
    expect(label[0]!.title).toBe('İlk kayıt');
    const file = await byDomain('20240503', 'voicememos');
    expect(file.map((h) => h.itemId)).toEqual([3]);
  });

  it('fotoğraflar: orijinal dosya adı, çöp hariç, itemId=fileId', async () => {
    const hits = await byDomain('cesme', 'photos');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.title).toBe('Tatil_Çeşme.HEIC');
    expect(hits[0]!.snippet).toBe('IMG_0001.HEIC');
    expect(hits[0]!.itemId).toMatch(/^[0-9a-f]{40}$/);
    expect(await byDomain('tatil_cop', 'photos')).toEqual([]);
    expect((await byDomain('img_0002', 'photos')).map((h) => h.title)).toEqual(['IMG_0002.JPG']);
  });

  it('domain başına limit uygulanır', async () => {
    const res = await globalSearch({ udid, rootPath, query: 'img_', limitPerDomain: 1 });
    expect(res.hits.filter((h) => h.domain === 'photos')).toHaveLength(1);
  });

  it('korpus önbelleği: tekrar eden aramada yeniden kurulmaz', async () => {
    await globalSearch({ udid, rootPath, query: 'merhaba' });
    const first = _corpusCacheStatsForTest();
    expect(first.entries).toBeGreaterThanOrEqual(8);
    await globalSearch({ udid, rootPath, query: 'selam' });
    expect(_corpusCacheStatsForTest()).toEqual(first);
  });

  it('bir domain düşerse diğerleri döner + failedDomains işaretlenir', async () => {
    const u2 = 'c'.repeat(40);
    writeSmsFixture(rootPath, u2);
    writeBrokenCallsFixture(rootPath, u2);
    const res = await globalSearch({ udid: u2, rootPath, query: 'merhaba' });
    expect(res.failedDomains).toEqual(['calls']);
    expect(res.hits.some((h) => h.domain === 'messages')).toBe(true);
  });

  it('hiçbir DB yoksa boş sonuç (crash değil, hata bayrağı yok)', async () => {
    const emptyUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(rootPath, emptyUdid), { recursive: true });
    const res = await globalSearch({ udid: emptyUdid, rootPath, query: 'test' });
    expect(res.hits).toEqual([]);
    expect(res.failedDomains).toBeUndefined();
  });

  it('LIKE joker girdisi güvenli (% ile her şey dönmez)', async () => {
    const res = await globalSearch({ udid, rootPath, query: '%%' });
    expect(res.hits).toEqual([]);
  });
});
