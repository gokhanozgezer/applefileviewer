import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { decodeToJpeg } from '@main/util/heic';
import path from 'node:path';
import fs from 'node:fs';
import { getTmpRoot } from '../setup';

describe('decodeToJpeg', () => {
  it('PNG → JPEG resize (aspect korunur, fit:inside)', async () => {
    // 800x600 kırmızı PNG üret
    const src = path.join(getTmpRoot(), 'test.png');
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toFile(src);
    const jpeg = await decodeToJpeg(src, 256);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    // fit:inside → en uzun kenar 256, aspect 4:3 → 256x192
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(192);
  });

  it('JPEG → JPEG resize (kare, aspect korunur)', async () => {
    const src = path.join(getTmpRoot(), 'test.jpg');
    await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 128, b: 0 } },
    })
      .jpeg()
      .toFile(src);
    const jpeg = await decodeToJpeg(src, 128);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    // kare → 128x128
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);
  });

  it('portrait PNG → JPEG resize (yüksek kenar 256)', async () => {
    // 300x600 → fit:inside, 256 → en uzun kenar 256, yani 128x256
    const src = path.join(getTmpRoot(), 'portrait.png');
    await sharp({
      create: { width: 300, height: 600, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toFile(src);
    const jpeg = await decodeToJpeg(src, 256);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(256);
  });

  it('withoutEnlargement — küçük resim büyütülmez', async () => {
    // 64x48 → size=256, withoutEnlargement → 64x48 kalır
    const src = path.join(getTmpRoot(), 'small.png');
    await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toFile(src);
    const jpeg = await decodeToJpeg(src, 256);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(64);
    expect(meta.height).toBeLessThanOrEqual(48);
  });

  it('var olmayan dosya → throw', async () => {
    await expect(decodeToJpeg(path.join(getTmpRoot(), 'yok.heic'), 256)).rejects.toThrow();
  });
});

describe('decodeToJpeg — Windows handle sızıntısı (sharp cache kapalı)', () => {
  it('decode sonrası kaynak dosya hemen silinebilir (EPERM yok)', async () => {
    const src = path.join(getTmpRoot(), 'locked.jpg');
    await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toFile(src);
    await decodeToJpeg(src, 64);
    // sharp dosya/operasyon cache'i handle'ı tutsaydı Windows'ta EPERM atardı
    fs.unlinkSync(src);
    expect(fs.existsSync(src)).toBe(false);
  });
});
