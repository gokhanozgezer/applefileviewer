import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  getManifestMtimeMs,
  invalidateManifestMtime,
  _resetManifestMtimeCache,
} from '@main/modules/backup/manifestMtime';
import { getTmpRoot } from '../../setup';

describe('manifestMtime', () => {
  let backupRoot: string;

  beforeEach(() => {
    _resetManifestMtimeCache();
    backupRoot = path.join(getTmpRoot(), 'backup');
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.writeFileSync(path.join(backupRoot, 'Manifest.plist'), '<?xml version="1.0"?><plist/>');
  });

  it('Manifest.plist mtime döner', async () => {
    const mtime = await getManifestMtimeMs('U', backupRoot);
    expect(typeof mtime).toBe('number');
    expect(mtime).toBeGreaterThan(0);
  });

  it('ikinci çağrı memoize (aynı değer, stat tekrar okumaz)', async () => {
    const m1 = await getManifestMtimeMs('U', backupRoot);
    // Dosya mtime değişse bile cache'ten döner
    const future = Date.now() + 5000;
    fs.utimesSync(path.join(backupRoot, 'Manifest.plist'), new Date(future), new Date(future));
    const m2 = await getManifestMtimeMs('U', backupRoot);
    expect(m2).toBe(m1); // memoize — değişmedi
  });

  it('invalidate sonrası yeni mtime okur', async () => {
    const m1 = await getManifestMtimeMs('U', backupRoot);
    const future = Date.now() + 5000;
    fs.utimesSync(path.join(backupRoot, 'Manifest.plist'), new Date(future), new Date(future));
    invalidateManifestMtime('U', backupRoot);
    const m2 = await getManifestMtimeMs('U', backupRoot);
    expect(m2).not.toBe(m1); // yeniden okudu
  });

  it('eksik Manifest.plist → throw', async () => {
    await expect(getManifestMtimeMs('U', path.join(getTmpRoot(), 'yok'))).rejects.toThrow();
  });
});
