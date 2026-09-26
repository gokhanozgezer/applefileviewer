import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { parseBackupDetails, extractInfoDetails } from '@main/modules/backup/parsePlists';
import { FIXTURES_ROOT, getTmpRoot } from '../../setup';

const UDID = 'abcdef0123456789abcdef0123456789abcdef01';

function writeInfo(root: string, udid: string, extraXml: string): void {
  const dir = path.join(root, udid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Device Name</key><string>Tel</string>
  <key>Product Type</key><string>iPhone14,5</string>
  ${extraXml}
</dict></plist>`,
  );
  fs.writeFileSync(
    path.join(dir, 'Manifest.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>IsEncrypted</key><false/></dict></plist>`,
  );
}

describe('parseBackupDetails', () => {
  it('fixture: Serial Number + Build Version okunur, source korunur', async () => {
    const d = await parseBackupDetails({
      udid: UDID,
      rootPath: path.join(FIXTURES_ROOT, 'backups'),
      source: 'override',
    });
    expect(d.serialNumber).toBe('F2LXR0XXXX');
    expect(d.buildVersion).toBe('22C161');
    expect(d.installedApps).toEqual([]);
    expect(d.imei).toBeNull();
    expect(d.phoneNumber).toBeNull();
    expect(d.source).toBe('override');
    expect(d.deviceName).toBe('Test iPhone');
  });

  it('IMEI, telefon numarası ve yüklü uygulamalar okunur', async () => {
    const root = getTmpRoot();
    writeInfo(
      root,
      UDID,
      `<key>IMEI</key><string>356789012345678</string>
       <key>Phone Number</key><string>+90 555 000 00 00</string>
       <key>Installed Applications</key><array>
         <string>com.apple.mobilesafari</string><string>net.whatsapp.WhatsApp</string>
       </array>`,
    );
    const d = await parseBackupDetails({ udid: UDID, rootPath: root, source: 'itunes' });
    expect(d.imei).toBe('356789012345678');
    expect(d.phoneNumber).toBe('+90 555 000 00 00');
    expect(d.installedApps).toEqual(['com.apple.mobilesafari', 'net.whatsapp.WhatsApp']);
    expect(d.parseError).toBeNull();
  });

  it('Info.plist yoksa detaylar boş, parseError dolu', async () => {
    const d = await parseBackupDetails({ udid: UDID, rootPath: getTmpRoot(), source: 'itunes' });
    expect(d.parseError).toMatch(/Info\.plist/);
    expect(d.serialNumber).toBeNull();
    expect(d.installedApps).toEqual([]);
  });

  it('Info.plist okunamasa da Manifest.plist IsEncrypted okunur (guard fail-open değil)', async () => {
    const dir = path.join(getTmpRoot(), UDID);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'Manifest.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>IsEncrypted</key><true/></dict></plist>`,
    );
    const d = await parseBackupDetails({ udid: UDID, rootPath: getTmpRoot(), source: 'itunes' });
    expect(d.parseError).toMatch(/Info\.plist/);
    expect(d.isEncrypted).toBe(true);
    expect(d.encryptionUnknown).toBe(false);
  });

  it('Manifest.plist okunamazsa şifreleme bilinmiyor (encryptionUnknown) — "şifresiz" varsayılmaz', async () => {
    writeInfo(getTmpRoot(), UDID, '');
    fs.rmSync(path.join(getTmpRoot(), UDID, 'Manifest.plist'));
    const d = await parseBackupDetails({ udid: UDID, rootPath: getTmpRoot(), source: 'itunes' });
    expect(d.encryptionUnknown).toBe(true);
    expect(d.parseError).toMatch(/Manifest\.plist/);
    expect(d.deviceName).toBe('Tel');
  });

  it('geçerli Manifest.plist → encryptionUnknown false', async () => {
    writeInfo(getTmpRoot(), UDID, '');
    const d = await parseBackupDetails({ udid: UDID, rootPath: getTmpRoot(), source: 'itunes' });
    expect(d.encryptionUnknown).toBe(false);
    expect(d.isEncrypted).toBe(false);
  });
});

describe('extractInfoDetails', () => {
  it('yanlış tipler ve boş stringler null / filtrelenir', () => {
    const r = extractInfoDetails({
      'Serial Number': 123,
      'Build Version': '   ',
      'Installed Applications': ['a.b', 5, '', 'c.d'],
      IMEI: true,
    } as unknown as Parameters<typeof extractInfoDetails>[0]);
    expect(r).toEqual({
      serialNumber: null,
      buildVersion: null,
      installedApps: ['a.b', 'c.d'],
      imei: null,
      phoneNumber: null,
    });
  });

  it('null info → boş detaylar', () => {
    expect(extractInfoDetails(null).installedApps).toEqual([]);
  });
});
