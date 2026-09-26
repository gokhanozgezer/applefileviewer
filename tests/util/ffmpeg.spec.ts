import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import {
  resolveUnpackedPath,
  runWithTimeout,
  extractThumbnail,
  transcode,
  FFMPEG_MAX_CONCURRENT,
  _withFfmpegSlotForTest,
  _activeFfmpegCountForTest,
} from '@main/util/ffmpeg';
import { produceCacheFile, _setCacheRootForTest } from '@main/cache';
import { getTmpRoot } from '../setup';

/** fluent-ffmpeg komutunun sahte hali: end/error emit + kill kaydı. */
class FakeCmd extends EventEmitter {
  killedWith: string | undefined;
  kill(signal?: string): void {
    this.killedWith = signal;
    // Gerçek ffmpeg kill sonrası 'error' emit eder — yutulmalı
    this.emit('error', new Error('ffmpeg was killed with signal SIGKILL'));
  }
}

describe('resolveUnpackedPath (paketli uygulama — asar içinden spawn edilemez)', () => {
  it('Windows: app.asar → app.asar.unpacked', () => {
    expect(
      resolveUnpackedPath(
        'C:\\Program Files\\AFV\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe',
      ),
    ).toBe(
      'C:\\Program Files\\AFV\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe',
    );
  });

  it('POSIX: app.asar → app.asar.unpacked', () => {
    expect(
      resolveUnpackedPath('/opt/afv/resources/app.asar/node_modules/ffmpeg-static/ffmpeg'),
    ).toBe('/opt/afv/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg');
  });

  it('zaten unpacked ya da dev path değişmez', () => {
    const unpacked = '/r/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg';
    expect(resolveUnpackedPath(unpacked)).toBe(unpacked);
    const dev = 'C:\\Work\\AppleFileViewer\\node_modules\\ffmpeg-static\\ffmpeg.exe';
    expect(resolveUnpackedPath(dev)).toBe(dev);
  });
});

describe('runWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('end → resolve', async () => {
    const cmd = new FakeCmd();
    const p = runWithTimeout(cmd, () => setImmediate(() => cmd.emit('end')), 1000, 'test');
    await expect(p).resolves.toBeUndefined();
    expect(cmd.killedWith).toBeUndefined();
  });

  it('error → reject', async () => {
    const cmd = new FakeCmd();
    const p = runWithTimeout(
      cmd,
      () => setImmediate(() => cmd.emit('error', new Error('boom'))),
      1000,
      'test',
    );
    await expect(p).rejects.toThrow('boom');
  });

  it('timeout → SIGKILL + timeout hatası (kill sonrası error yutulur)', async () => {
    vi.useFakeTimers();
    const cmd = new FakeCmd();
    const p = runWithTimeout(cmd, () => undefined, 5000, 'transcode');
    const assertion = expect(p).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
    expect(cmd.killedWith).toBe('SIGKILL');
  });
});

describe('global ffmpeg semaforu', () => {
  it(`aynı anda en fazla ${FFMPEG_MAX_CONCURRENT} iş çalışır, hepsi tamamlanır`, async () => {
    let running = 0;
    let peak = 0;
    const job = () =>
      _withFfmpegSlotForTest(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return 'ok';
      });
    const results = await Promise.all(Array.from({ length: 7 }, job));
    expect(results).toEqual(Array(7).fill('ok'));
    expect(peak).toBe(FFMPEG_MAX_CONCURRENT);
    expect(_activeFfmpegCountForTest()).toBe(0);
  });

  it('hata veren iş slotu bırakır', async () => {
    await expect(
      _withFfmpegSlotForTest(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(_activeFfmpegCountForTest()).toBe(0);
  });
});

describe('ffmpeg + produceCacheFile (gerçek ffmpeg-static)', () => {
  it('başarısız thumbnail: final cache dosyası ve yarım geçici dosya KALMAZ', async () => {
    const cacheRoot = path.join(getTmpRoot(), 'cache');
    _setCacheRootForTest(cacheRoot);
    const finalAbs = path.join(cacheRoot, 'deadbeef.jpg');
    const badInput = path.join(getTmpRoot(), 'not-a-video.mov');
    fs.writeFileSync(badInput, Buffer.from('bu bir video değil'));

    await expect(
      produceCacheFile(finalAbs, (tmp) => extractThumbnail(badInput, tmp, 64)),
    ).rejects.toThrow();
    expect(fs.existsSync(finalAbs)).toBe(false);
    expect(fs.readdirSync(cacheRoot)).toEqual([]);
  }, 30_000);
  it('başarılı transcode + thumbnail: eşzamanlı çağrılar TEK üretime bağlanır, geçici dosya kalmaz', async () => {
    const cacheRoot = path.join(getTmpRoot(), 'cache');
    _setCacheRootForTest(cacheRoot);
    // 1 sn'lik sentetik video (lavfi testsrc)
    const input = path.join(getTmpRoot(), 'in.mov');
    execFileSync(ffmpegPath as unknown as string, [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=64x64:rate=5',
      '-pix_fmt',
      'yuv420p',
      input,
    ]);

    const mp4 = path.join(cacheRoot, 'cafebabe.mp4');
    let calls = 0;
    const producer = (tmp: string) => {
      calls++;
      return transcode({ inputAbs: input, outputAbs: tmp, to: 'mp4' });
    };
    await Promise.all([produceCacheFile(mp4, producer), produceCacheFile(mp4, producer)]);
    expect(calls).toBe(1);
    expect(fs.statSync(mp4).size).toBeGreaterThan(0);

    const jpg = path.join(cacheRoot, 'cafebabe.jpg');
    await produceCacheFile(jpg, (tmp) => extractThumbnail(input, tmp, 32));
    const head = fs.readFileSync(jpg).subarray(0, 3);
    expect([...head]).toEqual([0xff, 0xd8, 0xff]);

    expect(fs.readdirSync(cacheRoot).sort()).toEqual(['cafebabe.jpg', 'cafebabe.mp4']);
  }, 60_000);
});
