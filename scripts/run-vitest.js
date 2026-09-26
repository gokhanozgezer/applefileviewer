#!/usr/bin/env node
// vitest'i Electron'un gömülü Node'u ile koşturur (ELECTRON_RUN_AS_NODE=1).
//
// Neden: better-sqlite3 tek bir .node binary'si taşır — ya Node ya Electron ABI'sine
// derlenir. Eskiden pretest Node ABI'ye, predev Electron ABI'ye rebuild ediyordu
// (ABI ping-pong). Rebuild başarısız olursa (ör. Node 24 için prebuild yok + yerel
// toolchain hatası) .node silinmiş kalıyor ve uygulama da açılmıyordu.
// Testleri Electron-Node'da koşturmak binary'yi HER ZAMAN Electron ABI'de tutar:
// rebuild yok, ping-pong yok, sistem Node sürümünden bağımsız.
//
// Kullanım: node scripts/run-vitest.js [vitest argümanları]  (varsayılan: run)

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBin = require('electron'); // electron paketinin export'u: binary yolu
const vitestEntry = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const args = process.argv.slice(2);
const child = spawn(electronBin, [vitestEntry, ...(args.length ? args : ['run'])], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
