import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROD_CSP, cspForMeta } from './src/shared/csp';

// Prod build'de index.html'e CSP <meta>'sı enjekte eder. Uygulama file:// ile
// yüklendiğinde session header enjeksiyonu tetiklenmeyebilir; meta her koşulda
// geçerlidir. apply:'build' → dev/HMR (unsafe-eval gerektirir) etkilenmez.
export function cspMetaPlugin(): Plugin {
  return {
    name: 'afv-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: cspForMeta(PROD_CSP) },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// Renderer'a derleme-zamanı sabitleri (Ayarlar > Hakkında) — package.json tek kaynak.
const pkg = createRequire(import.meta.url)('./package.json') as {
  version: string;
  author?: string;
  repository?: string | { url?: string };
};

// Güncelleyici "releases sayfası" bağlantısı için ham repository değeri — main'de
// updaterCore.parseGitHubRepo ile çözülür (owner/repo kodda sabit DEĞİL).
const pkgRepository =
  typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_AUTHOR__: JSON.stringify(pkg.author ?? ''),
  },
  plugins: [
    react(),
    cspMetaPlugin(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: [
                'better-sqlite3',
                'sharp',
                'fluent-ffmpeg',
                'ffmpeg-static',
                'heic-convert', // libde265 WASM loader __dirname kullanır — inline edilirse ESM'de patlar
                'electron-updater', // CJS; require('electron') + dinamik require — bundle edilmez
              ],
            },
          },
          define: {
            __APP_REPOSITORY__: JSON.stringify(pkgRepository),
          },
          resolve: {
            alias: {
              '@main': path.resolve(__dirname, 'src/main'),
              '@shared': path.resolve(__dirname, 'src/shared'),
            },
          },
        },
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: {
          build: { outDir: 'dist-electron/preload' },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'src/shared'),
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
