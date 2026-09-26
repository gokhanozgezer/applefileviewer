import { describe, it, expect } from 'vitest';
import { computeFileId, fileIdToBackupPath } from '@main/modules/manifest/fileId';

describe('computeFileId — golden (4-kaynak doğrulanmış: Node+sha1sum+Python+libimobiledevice)', () => {
  it('HomeDomain + Library/SMS/sms.db (libimobiledevice referansı)', () => {
    expect(computeFileId('HomeDomain', 'Library/SMS/sms.db')).toBe(
      '3d0d7e5fb2ce288813306e4d4636395e047a3d28',
    );
  });
  it('CameraRollDomain + Media/DCIM/100APPLE/IMG_0001.HEIC', () => {
    expect(computeFileId('CameraRollDomain', 'Media/DCIM/100APPLE/IMG_0001.HEIC')).toBe(
      '78564230ecf97df163e76713ce779e028c679bb6',
    );
  });
  it('WhatsApp uzun domain + ChatStorage.sqlite', () => {
    expect(
      computeFileId('AppDomainGroup-group.net.whatsapp.WhatsApp.shared', 'ChatStorage.sqlite'),
    ).toBe('7c7fba66680ef796b916b067077cc246adacf01d');
  });
  it('HomeDomain + AddressBook.sqlitedb', () => {
    expect(computeFileId('HomeDomain', 'Library/AddressBook/AddressBook.sqlitedb')).toBe(
      '31bb7ba8914766d4ba40d6dfb6113c8b614be442',
    );
  });
  it('boş relativePath edge (root-level kayıt): domain + "-"', () => {
    expect(computeFileId('CameraRollDomain', '')).toBe('be1f28f40e6e4e95dba86a2d9fa4b12dc70b9dc5');
  });
  it('Unicode relativePath (Türkçe Ö, UTF-8): Ölçüm.jpg', () => {
    expect(computeFileId('MediaDomain', 'Media/PhotoData/Ölçüm.jpg')).toBe(
      'c1f9ffca36e24bbe6846b14663581ab718742b4c',
    );
  });
});

describe('computeFileId — savunmalar', () => {
  it('çıktı lowercase 40-hex', () => {
    const id = computeFileId('HomeDomain', 'Library/SMS/sms.db');
    expect(id).toMatch(/^[a-f0-9]{40}$/);
  });
  it("domain boş string → throw (programmer error, geçerli backup'ta olmaz)", () => {
    expect(() => computeFileId('', 'Library/SMS/sms.db')).toThrow();
  });
  it('domain null/undefined → throw', () => {
    expect(() => computeFileId(null as unknown as string, 'x')).toThrow();
    expect(() => computeFileId(undefined as unknown as string, 'x')).toThrow();
  });
  it('relativePath null/undefined → throw (boş string OK ama null değil)', () => {
    expect(() => computeFileId('HomeDomain', null as unknown as string)).toThrow();
  });
});

describe('fileIdToBackupPath', () => {
  it('fileId → <root>/<fileId[0:2]>/<fileId>', () => {
    const root = '/backup/UDID';
    const fid = '3d0d7e5fb2ce288813306e4d4636395e047a3d28';
    // path.join normalize eder; sonuç root/3d/3d0d7e5f...
    const result = fileIdToBackupPath(root, fid);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(result.endsWith('3d' + require('path').sep + fid)).toBe(true);
  });
});
