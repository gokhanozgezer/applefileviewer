import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Projeler vitest.workspace.ts'te: main (node, seri) + renderer (jsdom).
// Burada paylaşılan alias + coverage.
export default defineConfig({
  test: {
    // KÖK seviyede olmak zorunda (workspace projelerinde override edilmiyor):
    // better-sqlite3 native + paylaşılan TMP_CACHE_DIR → dosya-arası paralellik
    // izolasyon race'i yaratır (tests/setup rmSync başka dosyanın snapshot'ını siler).
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts', 'src/renderer/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'html'],
      // Mandal (ratchet): 2026-09-26 ölçümü st/ln %51.5, br %79.6, fn %68.7 — eşikler
      // biraz altında; kapsam arttıkça yükseltilir, düşerse CI kırılır.
      thresholds: { statements: 50, lines: 50, branches: 77, functions: 66 },
    },
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
