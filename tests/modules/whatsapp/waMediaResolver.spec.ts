import { describe, it, expect } from 'vitest';
import {
  resolveWaMediaFileId,
  waMediaKind,
  waMimeFromKind,
} from '@main/modules/whatsapp/waMediaResolver';
import { computeFileId } from '@main/modules/manifest/fileId';
import { WA_DOMAIN } from '@main/modules/whatsapp/whatsappDb';

describe('resolveWaMediaFileId — Message/ prefix (gerçek-veri)', () => {
  it('Media/... (Message YOK) → Message/Media/... prefix eklenir', () => {
    // GERÇEK-VERİ: ZMEDIALOCALPATH = `Media/905x@.../d/c/UUID.jpg` (Message YOK)
    const localPath = 'Media/905551234567@s.whatsapp.net/d/c/UUID.jpg';
    const expected = computeFileId(
      WA_DOMAIN,
      'Message/Media/905551234567@s.whatsapp.net/d/c/UUID.jpg',
    );
    expect(resolveWaMediaFileId(localPath)).toBe(expected);
  });

  it('Message/Media/... zaten varsa korunur (çift prefix YOK)', () => {
    const localPath = 'Message/Media/905551234567@s.whatsapp.net/3/9/UUID/IMG_0001.jpg';
    const expected = computeFileId(WA_DOMAIN, localPath);
    expect(resolveWaMediaFileId(localPath)).toBe(expected);
  });

  it('mutlak yol /var/mobile/.../Media/... → Message/Media/...', () => {
    const localPath =
      '/var/mobile/Containers/Shared/AppGroup/X/Media/905x@s.whatsapp.net/a/b/F.opus';
    const expected = computeFileId(WA_DOMAIN, 'Message/Media/905x@s.whatsapp.net/a/b/F.opus');
    expect(resolveWaMediaFileId(localPath)).toBe(expected);
  });

  it('mutlak yol .../Message/Media/... → Message/ korunur', () => {
    const localPath = '~/Library/Message/Media/905x@s.whatsapp.net/a/b/F.jpg';
    const expected = computeFileId(WA_DOMAIN, 'Message/Media/905x@s.whatsapp.net/a/b/F.jpg');
    expect(resolveWaMediaFileId(localPath)).toBe(expected);
  });

  it('null / boş → null', () => {
    expect(resolveWaMediaFileId(null)).toBeNull();
    expect(resolveWaMediaFileId('')).toBeNull();
    expect(resolveWaMediaFileId('   ')).toBeNull();
  });

  it('Media/ içermeyen yol → baştaki / soyulur, fileId yine üretilir', () => {
    const expected = computeFileId(WA_DOMAIN, 'foo/bar.jpg');
    expect(resolveWaMediaFileId('/foo/bar.jpg')).toBe(expected);
  });
});

describe('waMediaKind — ZMESSAGETYPE → render tipi', () => {
  it('1 image, 2 video, 3 audio', () => {
    expect(waMediaKind(1)).toBe('image');
    expect(waMediaKind(2)).toBe('video');
    expect(waMediaKind(3)).toBe('audio');
  });
  it('11 gif / 14 sticker → image', () => {
    expect(waMediaKind(11)).toBe('image');
    expect(waMediaKind(14)).toBe('image');
  });
  it('8 document / bilinmeyen → file', () => {
    expect(waMediaKind(8)).toBe('file');
    expect(waMediaKind(99)).toBe('file');
    expect(waMediaKind(null)).toBe('file');
  });
});

describe('waMimeFromKind', () => {
  it('kind → mime', () => {
    expect(waMimeFromKind('image')).toBe('image/jpeg');
    expect(waMimeFromKind('video')).toBe('video/mp4');
    expect(waMimeFromKind('audio')).toBe('audio/ogg');
    expect(waMimeFromKind('file')).toBeNull();
  });
});
