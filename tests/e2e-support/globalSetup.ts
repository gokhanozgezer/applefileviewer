import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * İzole bir kök kurar: sentetik yedek + boş userData. Uygulama bunları
 * AFV_BACKUP_DIR / AFV_USER_DATA_DIR ile kullanır (src/main/pathOverrides.ts) —
 * gerçek kullanıcının yedekleri ve ayarları teste sızmaz. Fixture yazıcıları
 * better-sqlite3 (Electron ABI) kullandığından Electron-Node + vite-node altında koşar.
 */
export default function globalSetup(): void {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'afv-e2e-'));
  const backupParent = path.join(appData, 'Apple Computer', 'MobileSync', 'Backup');
  fs.mkdirSync(backupParent, { recursive: true });

  const root = path.resolve(__dirname, '..', '..');
  execFileSync(
    require('electron') as unknown as string,
    [
      path.join(root, 'node_modules', 'vite-node', 'vite-node.mjs'),
      '--config',
      path.join(root, 'vitest.config.ts'),
      path.join(root, 'tests', 'e2e-support', 'buildBackup.ts'),
      backupParent,
    ],
    { cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
  );

  process.env.AFV_BACKUP_DIR = backupParent;
  process.env.AFV_USER_DATA_DIR = path.join(appData, 'userData');
}
