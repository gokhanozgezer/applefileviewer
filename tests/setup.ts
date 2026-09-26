// Vitest global setup. Test fixture klasörü için path constants.
import { beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export const FIXTURES_ROOT = path.resolve(__dirname, 'fixtures');

// Her test öncesi izole tmp dir
let tmpRoot = '';
export const getTmpRoot = () => tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'afv-test-'));
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
