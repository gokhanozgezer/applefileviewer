import { describe, it, expect, afterEach } from 'vitest';
import {
  applyPlatformAttribute,
  getPlatform,
  pickByPlatform,
  toUiPlatform,
} from '@renderer/lib/platform';

const setApi = (v: unknown) => {
  (window as unknown as { api: unknown }).api = v;
};

describe('lib/platform', () => {
  afterEach(() => setApi(undefined));

  it('preload sabiti (window.api.platform) önceliklidir', () => {
    setApi({ platform: 'darwin' });
    expect(getPlatform()).toBe('darwin');
    setApi({ platform: 'linux' });
    expect(getPlatform()).toBe('linux');
    setApi({ platform: 'win32' });
    expect(getPlatform()).toBe('win32');
  });

  it('toUiPlatform: bsd vb. → linux ailesi', () => {
    expect(toUiPlatform('freebsd')).toBe('linux');
    expect(toUiPlatform(undefined)).toBe('linux');
    expect(toUiPlatform('darwin')).toBe('darwin');
  });

  it('applyPlatformAttribute <html data-platform> ayarlar', () => {
    applyPlatformAttribute(document.documentElement, 'darwin');
    expect(document.documentElement.dataset.platform).toBe('darwin');
    applyPlatformAttribute(document.documentElement, 'win32');
    expect(document.documentElement.dataset.platform).toBe('win32');
  });

  it('pickByPlatform', () => {
    const c = { win32: 'Explorer', darwin: 'Finder', linux: 'klasör' };
    expect(pickByPlatform(c, 'darwin')).toBe('Finder');
    expect(pickByPlatform(c, 'linux')).toBe('klasör');
    expect(pickByPlatform(c, 'win32')).toBe('Explorer');
  });
});
