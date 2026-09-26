import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import e2eGlobalSetup from './globalSetup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Ekran görüntüsü kurulumu: e2e ile AYNI sentetik yedek (globalSetup) + zengin
 * sentetik fotoğraf kütüphanesi (screenshotPhotos.ts). Gerçek yedeğe dokunulmaz —
 * uygulama AFV_BACKUP_DIR / AFV_USER_DATA_DIR ile izole köke bakar.
 */
export default function screenshotsSetup(): void {
  e2eGlobalSetup();
  const root = path.resolve(__dirname, '..', '..');
  execFileSync(
    require('electron') as unknown as string,
    [
      path.join(root, 'node_modules', 'vite-node', 'vite-node.mjs'),
      '--config',
      path.join(root, 'vitest.config.ts'),
      path.join(root, 'tests', 'e2e-support', 'screenshotPhotos.ts'),
      process.env.AFV_BACKUP_DIR!,
      'abcdef0123456789abcdef0123456789abcdef01', // buildBackup.ts E2E_UDID
    ],
    { cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
  );
}
