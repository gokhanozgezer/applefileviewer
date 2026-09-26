import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  parseBackupUrl,
  parseRange,
  contentTypeForExt,
  sniffContentType,
  resolveOrigContentType,
  rememberBackupRoot,
  getRememberedRoot,
  clearBackupRootCache,
  forgetBackupRootsUnder,
  FALLBACK_CONTENT_TYPE,
} from '@main/protocol';
import { getTmpRoot } from './setup';

describe('parseBackupUrl', () => {
  it('orig URL parse', () => {
    const p = parseBackupUrl(
      'backup://orig/abcdef0123456789abcdef0123456789abcdef01/3d0d7e5fb2ce288813306e4d4636395e047a3d28',
    );
    expect(p).toBeTruthy();
    expect(p!.variant).toBe('orig');
    expect(p!.fileId).toBe('3d0d7e5fb2ce288813306e4d4636395e047a3d28');
  });

  it('thumb URL + query', () => {
    const p = parseBackupUrl(
      'backup://thumb/abcdef0123456789abcdef0123456789abcdef01/3d0d7e5fb2ce288813306e4d4636395e047a3d28?size=256',
    );
    expect(p!.variant).toBe('thumb');
    expect(p!.search.get('size')).toBe('256');
  });

  it('GÜVENLİK: fileId hex değilse reddedilir (path traversal)', () => {
    expect(
      parseBackupUrl('backup://orig/abcdef0123456789abcdef0123456789abcdef01/..%2F..%2Fetc'),
    ).toBeNull();
    expect(
      parseBackupUrl('backup://orig/abcdef0123456789abcdef0123456789abcdef01/notahexfileid'),
    ).toBeNull();
  });

  it('GÜVENLİK: udid geçersizse reddedilir', () => {
    expect(
      parseBackupUrl('backup://orig/..%2F..%2F/3d0d7e5fb2ce288813306e4d4636395e047a3d28'),
    ).toBeNull();
  });

  it('bilinmeyen variant reddedilir', () => {
    expect(
      parseBackupUrl(
        'backup://evil/abcdef0123456789abcdef0123456789abcdef01/3d0d7e5fb2ce288813306e4d4636395e047a3d28',
      ),
    ).toBeNull();
  });

  it('eksik segment reddedilir', () => {
    expect(parseBackupUrl('backup://orig/onlyudid')).toBeNull();
  });
});

describe('parseRange', () => {
  it('bytes=0-1023 → start 0 end 1023', () => {
    expect(parseRange('bytes=0-1023', 10000)).toEqual({ start: 0, end: 1023 });
  });

  it('bytes=1024- (açık uç) → end = size-1', () => {
    expect(parseRange('bytes=1024-', 10000)).toEqual({ start: 1024, end: 9999 });
  });

  it('bytes=-500 (suffix) → son 500 byte', () => {
    expect(parseRange('bytes=-500', 10000)).toEqual({ start: 9500, end: 9999 });
  });

  it('end > size → size-1 cap', () => {
    expect(parseRange('bytes=0-99999', 10000)).toEqual({ start: 0, end: 9999 });
  });

  it('Range yoksa null', () => {
    expect(parseRange(null, 10000)).toBeNull();
  });

  it('geçersiz Range null', () => {
    expect(parseRange('bytes=abc-def', 10000)).toBeNull();
    expect(parseRange('bytes=5000-1000', 10000)).toBeNull();
  });

  it('start >= size null', () => {
    expect(parseRange('bytes=10000-', 10000)).toBeNull();
  });
});

describe('contentTypeForExt', () => {
  it('bilinen uzantılar (nokta/büyük harf toleranslı)', () => {
    expect(contentTypeForExt('jpg')).toBe('image/jpeg');
    expect(contentTypeForExt('.HEIC')).toBe('image/heic');
    expect(contentTypeForExt('mov')).toBe('video/quicktime');
    expect(contentTypeForExt('mp4')).toBe('video/mp4');
    expect(contentTypeForExt('m4a')).toBe('audio/mp4');
    expect(contentTypeForExt('amr')).toBe('audio/amr');
    expect(contentTypeForExt('caf')).toBe('audio/x-caf');
    expect(contentTypeForExt('pdf')).toBe('application/pdf');
  });

  it('bilinmeyen / boş → application/octet-stream', () => {
    expect(contentTypeForExt('xyz')).toBe(FALLBACK_CONTENT_TYPE);
    expect(contentTypeForExt('')).toBe(FALLBACK_CONTENT_TYPE);
    expect(contentTypeForExt(null)).toBe(FALLBACK_CONTENT_TYPE);
  });
});

describe('sniffContentType (uzantısız yedek dosyaları)', () => {
  const ftyp = (brand: string) =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp' + brand, 'latin1')]);

  it('magic byte → MIME', () => {
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(sniffContentType(Buffer.from('GIF89a'))).toBe('image/gif');
    expect(sniffContentType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffContentType(Buffer.from('#!AMR\n'))).toBe('audio/amr');
    expect(sniffContentType(Buffer.from('caff\x00\x01'))).toBe('audio/x-caf');
    expect(sniffContentType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '))).toBe('image/webp');
    expect(sniffContentType(ftyp('heic'))).toBe('image/heic');
    expect(sniffContentType(ftyp('mif1'))).toBe('image/heic');
    expect(sniffContentType(ftyp('qt  '))).toBe('video/quicktime');
    expect(sniffContentType(ftyp('M4A '))).toBe('audio/mp4');
    expect(sniffContentType(ftyp('isom'))).toBe('video/mp4');
  });

  it('tanınmayan / boş → octet-stream', () => {
    expect(sniffContentType(Buffer.from('hello world'))).toBe(FALLBACK_CONTENT_TYPE);
    expect(sniffContentType(Buffer.alloc(0))).toBe(FALLBACK_CONTENT_TYPE);
  });
});

describe('resolveOrigContentType', () => {
  it('?ext= öncelikli; bilinmeyen/geçersiz ext → sniff; dosya yok → octet-stream', async () => {
    const f = path.join(getTmpRoot(), 'abc');
    fs.writeFileSync(f, Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]));
    expect(await resolveOrigContentType(f, 'pdf')).toBe('application/pdf');
    expect(await resolveOrigContentType(f, null)).toBe('image/jpeg');
    expect(await resolveOrigContentType(f, 'weird')).toBe('image/jpeg');
    expect(await resolveOrigContentType(f, '../../x')).toBe('image/jpeg');
    expect(await resolveOrigContentType(path.join(getTmpRoot(), 'yok'), null)).toBe(
      FALLBACK_CONTENT_TYPE,
    );
  });
});

describe('clearBackupRootCache', () => {
  it('udid verilirse yalnız onu, verilmezse hepsini unutur', () => {
    rememberBackupRoot('udid-a', '/roots/a');
    rememberBackupRoot('udid-b', '/roots/b');
    clearBackupRootCache('udid-a');
    expect(getRememberedRoot('udid-a')).toBeUndefined();
    expect(getRememberedRoot('udid-b')).toBe('/roots/b');
    clearBackupRootCache();
    expect(getRememberedRoot('udid-b')).toBeUndefined();
  });
});

describe('forgetBackupRootsUnder', () => {
  it('yalnız eski override altındaki udid kökleri unutulur; default kökteki aktif yedek kalır', () => {
    const def = path.join(getTmpRoot(), 'MobileSync', 'Backup');
    const ovr = path.join(getTmpRoot(), 'override');
    rememberBackupRoot('udid-def', path.join(def, 'udid-def'));
    rememberBackupRoot('udid-ovr', path.join(ovr, 'udid-ovr'));
    // Önek benzerliği (override2) alt dizin sayılmaz
    rememberBackupRoot('udid-ovr2', path.join(ovr + '2', 'udid-ovr2'));
    expect(forgetBackupRootsUnder(ovr, def)).toBe(1);
    expect(getRememberedRoot('udid-ovr')).toBeUndefined();
    expect(getRememberedRoot('udid-def')).toBe(path.join(def, 'udid-def'));
    expect(getRememberedRoot('udid-ovr2')).toBe(path.join(ovr + '2', 'udid-ovr2'));
    clearBackupRootCache();
  });

  it('override default kökü kapsasa bile default altındakiler korunur', () => {
    const parent = path.join(getTmpRoot(), 'all');
    const def = path.join(parent, 'MobileSync');
    rememberBackupRoot('udid-def', path.join(def, 'udid-def'));
    rememberBackupRoot('udid-x', path.join(parent, 'other', 'udid-x'));
    expect(forgetBackupRootsUnder(parent, def)).toBe(1);
    expect(getRememberedRoot('udid-def')).toBe(path.join(def, 'udid-def'));
    expect(getRememberedRoot('udid-x')).toBeUndefined();
    clearBackupRootCache();
  });

  it('birden çok korunan kök (Windows: iTunes + Apple Devices) — hepsinin altı korunur', () => {
    const parent = path.join(getTmpRoot(), 'multi');
    const a = path.join(parent, 'itunes');
    const b = path.join(parent, 'apple');
    rememberBackupRoot('udid-a', path.join(a, 'udid-a'));
    rememberBackupRoot('udid-b', path.join(b, 'udid-b'));
    rememberBackupRoot('udid-c', path.join(parent, 'other', 'udid-c'));
    expect(forgetBackupRootsUnder(parent, [a, b])).toBe(1);
    expect(getRememberedRoot('udid-a')).toBe(path.join(a, 'udid-a'));
    expect(getRememberedRoot('udid-b')).toBe(path.join(b, 'udid-b'));
    expect(getRememberedRoot('udid-c')).toBeUndefined();
    clearBackupRootCache();
  });
});
