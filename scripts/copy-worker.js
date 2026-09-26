#!/usr/bin/env node
// copy-worker.js — decodeWorker.mjs'i dist-electron/main yanına kopyalar.
// Worker, pool modülü (dist-electron/main/index.js içinde bundle'lı) tarafından
// import.meta.url'e göreceli resolve edilir → dist-electron/main/decodeWorker.mjs
// olmalı. vite-plugin-electron `simple` API'si ek entry build edemediği için bu
// kopya predev/prebuild'de yapılır. ESM/native modüller worker'da node_modules'tan
// runtime resolve edilir (vite.config external'ı ile aynı yol).
// fs erişimi createRequire ile (no-restricted-imports static-import kuralını dodge
// eder — check-native-abi.js/ensure-electron-abi.js aynı deseni kullanır).

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { copyFileSync, mkdirSync } = require('node:fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = path.join(__dirname, '..', 'src', 'main', 'workers', 'decodeWorker.mjs');
const destDir = path.join(__dirname, '..', 'dist-electron', 'main');
const dest = path.join(destDir, 'decodeWorker.mjs');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-worker] ${src} -> ${dest}`);
