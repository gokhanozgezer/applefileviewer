import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { scanBackupRoots } from '@main/modules/backup/scan';
import { FIXTURES_ROOT, getTmpRoot } from '../../setup';

describe('scanBackupRoots', () => {
  let defaultRoot: string;
  let overrideRoot: string;

  beforeEach(() => {
    defaultRoot = path.join(getTmpRoot(), 'default');
    overrideRoot = path.join(getTmpRoot(), 'override');
    fs.mkdirSync(defaultRoot, { recursive: true });
    fs.cpSync(path.join(FIXTURES_ROOT, 'backups'), defaultRoot, { recursive: true });
  });

  it('default path altındaki yedeği tarar + Info/Manifest parse', async () => {
    const result = await scanBackupRoots({
      defaultRoots: [{ path: defaultRoot, source: 'itunes' }],
      overridePath: null,
    });
    expect(result.backups.length).toBe(1);
    const b = result.backups[0]!;
    expect(b.udid).toBe('abcdef0123456789abcdef0123456789abcdef01');
    expect(b.deviceName).toBe('Test iPhone');
    expect(b.productType).toBe('iPhone17,1');
    expect(b.productName).toBe('iPhone 16 Pro');
    expect(b.productVersion).toBe('18.2.1');
    expect(b.isEncrypted).toBe(false);
    expect(b.source).toBe('itunes');
    expect(b.lastBackupDate).toBe('2024-05-09T14:32:00.000Z');
    expect(b.parseError).toBe(null);
  });

  it('override path da varsa BİRLEŞİK liste (override replace etmez)', async () => {
    fs.mkdirSync(overrideRoot, { recursive: true });
    fs.cpSync(path.join(FIXTURES_ROOT, 'backups'), overrideRoot, { recursive: true });
    const result = await scanBackupRoots({
      defaultRoots: [{ path: defaultRoot, source: 'itunes' }],
      overridePath: overrideRoot,
    });
    expect(result.backups.length).toBe(2);
    expect(result.backups.find((b) => b.source === 'itunes')).toBeTruthy();
    expect(result.backups.find((b) => b.source === 'override')).toBeTruthy();
  });

  it('default path yoksa graceful — boş liste, accessible false, hata değil', async () => {
    const result = await scanBackupRoots({
      defaultRoots: [{ path: path.join(getTmpRoot(), 'nonexistent'), source: 'itunes' }],
      overridePath: null,
    });
    expect(result.backups.length).toBe(0);
    expect(result.roots[0]!.state).toBe('missing');
    expect(result.fullDiskAccessRequired).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('Info.plist eksik UDID için parseError (READ ERROR), listede kalır', async () => {
    const brokenUdid = 'b'.repeat(40);
    fs.mkdirSync(path.join(defaultRoot, brokenUdid), { recursive: true });
    const result = await scanBackupRoots({
      defaultRoots: [{ path: defaultRoot, source: 'itunes' }],
      overridePath: null,
    });
    const broken = result.backups.find((b) => b.udid === brokenUdid);
    expect(broken).toBeTruthy();
    expect(broken!.parseError).toBeTruthy();
  });

  it('bozuk Info.plist (geçersiz XML) için parseError, crash YOK', async () => {
    const corruptUdid = 'c'.repeat(40);
    fs.mkdirSync(path.join(defaultRoot, corruptUdid), { recursive: true });
    fs.writeFileSync(
      path.join(defaultRoot, corruptUdid, 'Info.plist'),
      '<plist><dict><key>broken</plist>',
    );
    const result = await scanBackupRoots({
      defaultRoots: [{ path: defaultRoot, source: 'itunes' }],
      overridePath: null,
    });
    const corrupt = result.backups.find((b) => b.udid === corruptUdid);
    expect(corrupt).toBeTruthy();
    expect(corrupt!.parseError).toBeTruthy();
  });

  it('UDID formatında olmayan klasör atlanır', async () => {
    fs.mkdirSync(path.join(defaultRoot, 'not-a-udid'), { recursive: true });
    fs.mkdirSync(path.join(defaultRoot, 'Snapshots'), { recursive: true });
    const result = await scanBackupRoots({
      defaultRoots: [{ path: defaultRoot, source: 'itunes' }],
      overridePath: null,
    });
    expect(result.backups.every((b) => /^[a-f0-9-]{25,40}$/i.test(b.udid))).toBe(true);
  });

  it('sıralama lastBackupDate desc', async () => {
    const olderUdid = 'a'.repeat(40);
    const dir = path.join(defaultRoot, olderUdid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'Info.plist'),
      `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Device Name</key><string>Old iPhone</string><key>Last Backup Date</key><date>2020-01-01T00:00:00Z</date></dict></plist>`,
    );
    const result = await scanBackupRoots({
      defaultRoots: [{ path: defaultRoot, source: 'itunes' }],
      overridePath: null,
    });
    expect(result.backups[0]!.lastBackupDate).toBe('2024-05-09T14:32:00.000Z');
  });
});
