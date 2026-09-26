#!/usr/bin/env node
// Electron ABI garantisi — dev/build ÖNCESİ çağrılır (predev/prebuild hook).
//
// better-sqlite3 binary'si HER ZAMAN Electron ABI'de tutulur. Testler de Electron'un gömülü
// Node'unda koşar (scripts/run-vitest.js, ELECTRON_RUN_AS_NODE=1) — eskiden pretest Node ABI'ye
// rebuild ediyordu (ABI ping-pong); rebuild başarısız olunca .node silinip uygulama açılmıyordu.
// Bu script yalnızca binary yanlışlıkla Node ABI'ye derlendiyse (ör. elle npm rebuild) düzeltir.
//
// Mantık: Node'da require denenir.
//   - BAŞARILI → modül Node ABI'de → Electron için yeniden derle (electron-rebuild -f)
//   - NODE_MODULE_VERSION hatası → zaten Electron ABI (Node'da yüklenemiyor) → atla, hazır
//   - Başka hata → bilinmiyor, güvenli tarafta yeniden derle

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Senkron bekleme (Atomics.wait — CPU yakmaz, busy-wait değil).
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Windows'a özgü: better_sqlite3.node başka bir process (asılı electron/node, AV) tarafından
// kilitliyse @electron/rebuild eski .node'u unlink edemez → EPERM. Lock genelde kısa sürer
// (process kapanışı) → retry. Kalıcı kilitte net yönlendirme.
//
// KRİTİK DERS (EPERM'in asıl kaynağı buydu): ABI tespiti için native modül BU process'e
// require edilirse Windows yüklü DLL'i kilitler — child rebuild kendi parent'ının kilidine
// çarpar ve HER ZAMAN EPERM alır. Tespit bu yüzden AYRI bir node child'ında yapılır
// (child kapanınca kilit kalkar). Ayrıca execSync hatasının message'ında 'EPERM' geçmez
// (stderr inherit'e gider) — retry tetiklenmiyordu; artık her hata retryable sayılır ve
// denemeler arasında eski .node silinmeyi denenir.
const MAX_ATTEMPTS = 4;
const NODE_BINARY_PATH = 'node_modules/better-sqlite3/build/Release/better_sqlite3.node';

function rebuildForElectron() {
  // @electron/rebuild (node_modules) kullan — "electron-rebuild" (tire'li) npx'te DEPRECATED
  // registry paketini indirir ve Node ABI üretir (yanlış).
  // -v <electronVersion> EXPLICIT şart: otomatik tespit başarısız olursa Node ABI'ye düşer.
  const electronVersion = require('electron/package.json').version;
  const cmd = `npx @electron/rebuild -f -w better-sqlite3 -v ${electronVersion}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.error(
        `[ensure-electron-abi] better-sqlite3 Electron ABI’ye derleniyor (deneme ${attempt}/${MAX_ATTEMPTS}, -v ${electronVersion})...`,
      );
      execSync(cmd, { stdio: 'inherit' });
      console.error('[ensure-electron-abi] Electron ABI hazır.');
      return;
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        // Kısa süreli kilit (kapanan process/AV taraması) için: eski binary'yi
        // silmeyi dene (kilit kalktıysa başarır, rebuild'in unlink adımı düşer),
        // bekle, yeniden dene. execSync message'ı hata türünü taşımaz — her
        // başarısızlık retryable kabul edilir.
        try {
          const fs = require('node:fs');
          fs.rmSync(NODE_BINARY_PATH, { force: true });
          console.error('[ensure-electron-abi] eski better_sqlite3.node silindi.');
        } catch {
          /* hâlâ kilitli — bekleyip tekrar denenecek */
        }
        console.error(
          `[ensure-electron-abi] better_sqlite3.node kilitli olabilir (deneme ${attempt}). 1.5sn bekleyip yeniden denenecek...`,
        );
        sleepSync(1500);
        continue;
      }
      // Son deneme veya kilit-dışı hata → net yönlendirme
      console.error('');
      console.error('[ensure-electron-abi] HATA: better-sqlite3 Electron ABI’ye derlenemedi.');
      console.error('  Muhtemel sebep: better_sqlite3.node başka bir process tarafından KİLİTLİ.');
      console.error('  ÇÖZÜM:');
      console.error('   1) Tüm electron.exe ve node.exe process’lerini kapatın (Task Manager).');
      console.error('   2) npm run dev’i tekrar çalıştırın.');
      console.error(
        '   3) Hâlâ olmazsa node_modules/better-sqlite3/build/Release/better_sqlite3.node dosyasını silip tekrar deneyin.',
      );
      console.error('');
      throw e;
    }
  }
}

// ABI tespiti AYRI child process'te — bu process DLL'i yüklerse rebuild'in
// unlink adımı parent'ın kilidine çarpar (yukarıdaki KRİTİK DERS notu).
function detectAbi() {
  try {
    execSync(`node -e "const D=require('better-sqlite3'); new D(':memory:').close()"`, {
      stdio: 'pipe',
    });
    return 'node'; // Node'da yüklendi → Node ABI
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}${e.message || ''}`;
    if (out.includes('NODE_MODULE_VERSION')) return 'electron'; // Node'da yüklenemiyor → Electron ABI
    return 'unknown';
  }
}

const abi = detectAbi();
if (abi === 'electron') {
  console.error('[ensure-electron-abi] better-sqlite3 zaten Electron ABI’de — atlanıyor.');
} else {
  // Node ABI veya bilinmeyen durum → güvenli tarafta yeniden derle
  rebuildForElectron();
}
