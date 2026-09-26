import { defineWorkspace } from 'vitest/config';

// İki test projesi:
//  - main: node ortamı, SERİ (better-sqlite3 native + paylaşılan TMP_CACHE_DIR)
//  - renderer: jsdom + Testing Library (DOM testleri native modüle dokunmaz)
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'main',
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
      exclude: ['tests/renderer/**', 'node_modules/**'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'renderer',
      environment: 'jsdom',
      setupFiles: ['./tests/renderer/setup.ts'],
      include: ['tests/renderer/**/*.spec.{ts,tsx}'],
    },
  },
]);
