// scan — macOS TCC: kökün stat'ı başarılı ama listelemesi EPERM → permissionDenied +
// fullDiskAccessRequired (yalnız darwin). safeFs taklit edilir (Windows'ta EPERM üretilemez).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const denied = new Set<string>();

vi.mock('@main/safeFs', () => ({
  stat: vi.fn(async () => ({ isDirectory: () => true })),
  readdir: vi.fn(async (p: string) => {
    if (denied.has(p)) {
      const e = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
      e.code = 'EPERM';
      throw e;
    }
    return [];
  }),
  readFile: vi.fn(),
}));
vi.mock('@main/util/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { scanBackupRoots } = await import('@main/modules/backup/scan');

const MAC_ROOT = '/Users/u/Library/Application Support/MobileSync/Backup';

describe('scanBackupRoots — izin durumu', () => {
  beforeEach(() => denied.clear());

  it('macOS: EPERM → permissionDenied + fullDiskAccessRequired', async () => {
    denied.add(MAC_ROOT);
    const r = await scanBackupRoots({
      defaultRoots: [{ path: MAC_ROOT, source: 'finder' }],
      overridePath: null,
      platform: 'darwin',
    });
    expect(r.roots).toEqual([{ path: MAC_ROOT, source: 'finder', state: 'permissionDenied' }]);
    expect(r.fullDiskAccessRequired).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.backups).toEqual([]);
  });

  it('Linux/Windows: EPERM durum olarak raporlanır ama Tam Disk Erişimi istenmez', async () => {
    denied.add('/data/bk');
    const r = await scanBackupRoots({
      defaultRoots: [],
      overridePath: '/data/bk',
      platform: 'linux',
    });
    expect(r.roots).toEqual([{ path: '/data/bk', source: 'override', state: 'permissionDenied' }]);
    expect(r.overridePathAccessible).toBe(false);
    expect(r.fullDiskAccessRequired).toBe(false);
  });

  it('erişilebilir kök ok; override varsayılanla aynıysa ikinci kez taranmaz', async () => {
    const r = await scanBackupRoots({
      defaultRoots: [{ path: MAC_ROOT, source: 'finder' }],
      overridePath: MAC_ROOT,
      platform: 'darwin',
    });
    expect(r.roots).toHaveLength(1);
    expect(r.roots[0]!.state).toBe('ok');
    expect(r.overridePathAccessible).toBe(true);
    expect(r.fullDiskAccessRequired).toBe(false);
  });
});
