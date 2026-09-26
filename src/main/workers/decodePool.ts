// decodePool.ts — worker_threads havuzu (thumb decode). MAIN PROCESS decode YAPMAZ;
// koordinasyon + cache yazımı main'de, ağır decode worker'larda.
//
// Düşük-CPU adapt (ürünün varlık sebebi: düşük-CPU Windows/Linux):
//   - os.cpus().length ≤ 4 → 2 worker, cache warming KAPALI
//   - > 4 → cpus-2 worker (max 6), cache warming AÇIK (bu fazda warming ATLANDI — NOT)
//
// CONCURRENCY SEMAPHORE (BUG 5 — fan sürekli coşuyor):
//   Worker sayısı doğal limit DEĞİL yeterli: 12-çekirdekte 6 worker = 6 eşzamanlı
//   decode = TÜM çekirdekler doygun = fan %100. Scroll sırasında bu çok agresif.
//   Worker sayısından BAĞIMSIZ ikinci limit: aynı anda max maxConcurrent decode.
//     - düşük-CPU (≤4) → 2
//     - yüksek-CPU (>4) → 2  (BUG 5: 3 bile yüksek-CPU'da fan'i coşturdu, 2'ye düşürüldü)
//   activeCount < maxConcurrent koşulu drain()'de — fazla worker boşta bekler,
//   busy-loop YOK (idle'da CPU düşer). Bu sayede decode bitince fan susar.
//
// İPTAL (scroll kilidi çözümü): enqueue(job, signal). Signal abort olursa:
//   - job kuyruktaysa → kuyruktan ÇIKAR (worker'a hiç gitmez)
//   - worker'daysa → sonuç gelince atılır (worker'ı durduramayız ama bir sonraki
//     job'a hemen geçer). Hızlı scroll'da 500 tile geçilse de sadece worker'a
//     ulaşan ~maxConcurrent kadar decode başlar; gerisi kuyruktan iptalle düşer.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { logger } from '@main/util/log';

export interface DecodeJob {
  absPath: string;
  size: number;
  kind?: 'video' | 'photo';
}

interface QueueEntry {
  job: DecodeJob;
  signal?: AbortSignal;
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
  onAbort?: () => void;
}

interface PendingJob {
  jobId: number;
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
  aborted: boolean;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

// Worker dosyası bundle yanında (scripts/copy-worker.js → dist-electron/main/decodeWorker.mjs).
// import.meta.url = dist-electron/main/index.js (pool bundle'a dahil).
function resolveWorkerPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, 'decodeWorker.mjs');
}

class DecodePool {
  private workers: PoolWorker[] = [];
  private queue: QueueEntry[] = [];
  private pending = new Map<number, PendingJob>();
  private nextJobId = 1;
  private started = false;
  private activeCount = 0;
  // İPTAL KANITI: kuyruktan düşen (worker'a hiç gitmeyen) job sayısı. Her 50'de bir
  // loglanır → "decode iptal N" main.log'da görülür (görünmeyen tile decode edilmedi).
  private abortedCount = 0;

  private noteAborted(): void {
    this.abortedCount++;
    if (this.abortedCount % 50 === 0) {
      logger.info(`[decodePool] decode iptal ${this.abortedCount} (kuyruktan düşen)`);
    }
  }
  readonly size: number;
  readonly maxConcurrent: number;
  readonly cacheWarmingEnabled: boolean;

  constructor() {
    const cpus = os.cpus().length || 1;
    if (cpus <= 2) {
      // Çift çekirdek ve altı: TEK worker, TEK eşzamanlı decode. 2 paralel
      // heic-convert bu sınıfta UI'ı komple kilitliyor (main + renderer + worker
      // aynı 2 çekirdeği paylaşır) — decode yavaşlar ama uygulama akıcı kalır.
      this.size = 1;
      this.maxConcurrent = 1;
      this.cacheWarmingEnabled = false;
    } else if (cpus <= 4) {
      this.size = 2;
      this.maxConcurrent = 2;
      this.cacheWarmingEnabled = false;
    } else {
      this.size = Math.min(6, cpus - 2);
      // BUG 5 — fan sürekli coşuyor. heic-convert CPU-yoğun; 3 paralel bile yüksek-CPU'da
      // tüm çekirdekleri doyuruyordu. 2'ye düşür (düşük-CPU zaten 2). Scroll sırasında
      // aynı anda max 2 decode → fan kontrol altında, decode bitince CPU düşer.
      this.maxConcurrent = 2;
      this.cacheWarmingEnabled = true;
    }
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    const workerPath = resolveWorkerPath();
    for (let i = 0; i < this.size; i++) {
      this.spawnWorker(workerPath);
    }
    logger.info(
      `[decodePool] started size=${this.size} maxConcurrent=${this.maxConcurrent} cpus=${os.cpus().length} warming=${this.cacheWarmingEnabled}`,
    );
  }

  private spawnWorker(workerPath: string): void {
    const worker = new Worker(workerPath);
    const pw: PoolWorker = { worker, busy: false };
    worker.on(
      'message',
      (msg: { jobId: number; ok: boolean; buffer?: ArrayBuffer; error?: string }) => {
        pw.busy = false;
        if (this.activeCount > 0) this.activeCount--;
        const p = this.pending.get(msg.jobId);
        this.pending.delete(msg.jobId);
        if (p && !p.aborted) {
          if (msg.ok && msg.buffer) p.resolve(Buffer.from(msg.buffer));
          else p.reject(new Error(msg.error ?? 'worker decode failed'));
        }
        this.drain();
      },
    );
    worker.on('error', (err) => {
      logger.error(`[decodePool] worker error: ${err.message}`);
      // Bu worker'a atanmış pending'i reddet, worker'ı yenile.
      if (pw.busy && this.activeCount > 0) this.activeCount--;
      pw.busy = false;
      this.respawn(pw, workerPath);
      this.drain();
    });
    this.workers.push(pw);
  }

  private respawn(pw: PoolWorker, workerPath: string): void {
    const idx = this.workers.indexOf(pw);
    if (idx >= 0) this.workers.splice(idx, 1);
    void pw.worker.terminate().catch(() => undefined);
    this.spawnWorker(workerPath);
  }

  private drain(): void {
    for (const pw of this.workers) {
      if (pw.busy) continue;
      // Concurrency semaphore: worker boşta olsa bile aynı anda max maxConcurrent
      // decode (fan kontrolü). Fazla worker bilinçli boşta bekler — busy-loop YOK.
      if (this.activeCount >= this.maxConcurrent) return;
      // Kuyruktan iptal edilmemiş ilk job'u al (iptal edilmişler atlanır).
      let entry: QueueEntry | undefined;
      while ((entry = this.queue.shift())) {
        if (entry.signal?.aborted) {
          this.noteAborted();
          entry.onAbort?.();
          entry.reject(abortError());
          continue;
        }
        break;
      }
      if (!entry) return; // kuyruk boş
      const jobId = this.nextJobId++;
      const pending: PendingJob = {
        jobId,
        resolve: entry.resolve,
        reject: entry.reject,
        aborted: false,
      };
      this.pending.set(jobId, pending);
      // Worker'a gittikten sonra abort olursa: sonucu at (worker'ı durduramayız).
      if (entry.signal) {
        const onAbort = () => {
          pending.aborted = true;
          entry!.reject(abortError());
        };
        if (entry.signal.aborted) {
          onAbort();
          this.pending.delete(jobId);
          continue;
        }
        entry.signal.addEventListener('abort', onAbort, { once: true });
      }
      pw.busy = true;
      this.activeCount++;
      pw.worker.postMessage({ jobId, ...entry.job });
    }
  }

  enqueue(job: DecodeJob, signal?: AbortSignal): Promise<Buffer> {
    this.ensureStarted();
    return new Promise<Buffer>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const entry: QueueEntry = { job, signal, resolve, reject };
      // Kuyruktayken abort: kuyruktan çıkar (worker'a hiç gitmesin).
      if (signal) {
        const onAbort = () => {
          const idx = this.queue.indexOf(entry);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
            this.noteAborted();
            reject(abortError());
          }
        };
        entry.onAbort = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }
      this.queue.push(entry);
      this.drain();
    });
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((pw) => pw.worker.terminate().catch(() => undefined)));
    this.workers = [];
    this.queue = [];
    this.pending.clear();
    this.activeCount = 0;
    this.started = false;
  }
}

export function abortError(): Error {
  const e = new Error('decode aborted');
  e.name = 'AbortError';
  return e;
}

let _pool: DecodePool | null = null;

export function getDecodePool(): DecodePool {
  if (!_pool) _pool = new DecodePool();
  return _pool;
}

export type { DecodePool };
