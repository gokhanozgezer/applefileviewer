import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { parseBackupPlists } from '@main/modules/backup/parsePlists';
import { setBackupRoot, getBackupRoot } from '@main/safeFs';
import { FIXTURES_ROOT, getTmpRoot } from '../../setup';

describe('backup:open setBackupRoot invariant', () => {
  let rootPath: string;
  const udid = 'abcdef0123456789abcdef0123456789abcdef01';

  beforeEach(() => {
    rootPath = path.join(getTmpRoot(), 'backups-root');
    fs.mkdirSync(rootPath, { recursive: true });
    fs.cpSync(path.join(FIXTURES_ROOT, 'backups'), rootPath, { recursive: true });
  });

  it('setBackupRoot seçilen yedeğin klasörüne sabitler', () => {
    const expectedRoot = path.join(rootPath, udid);
    setBackupRoot(expectedRoot);
    expect(getBackupRoot()).toBe(path.resolve(expectedRoot));
  });

  it('parseBackupPlists open için doğru summary döner', async () => {
    const summary = await parseBackupPlists({ udid, rootPath, source: 'itunes' });
    expect(summary.deviceName).toBe('Test iPhone');
    expect(summary.productName).toBe('iPhone 16 Pro');
    expect(summary.isEncrypted).toBe(false);
  });
});
