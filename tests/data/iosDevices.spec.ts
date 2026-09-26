import { describe, it, expect } from 'vitest';
import { lookupDeviceName, iosDevices } from '@main/data/iosDevices';

describe('iosDevices', () => {
  it('iPhone17,1 → "iPhone 16 Pro" (kullanıcının yedeği bu model — kritik spot-check)', () => {
    expect(lookupDeviceName('iPhone17,1')).toBe('iPhone 16 Pro');
  });

  it('iPhone15,2 → "iPhone 14 Pro"', () => {
    expect(lookupDeviceName('iPhone15,2')).toBe('iPhone 14 Pro');
  });

  it("iPad16,5 → 'iPad Pro 13\" (M4)'", () => {
    expect(lookupDeviceName('iPad16,5')).toBe('iPad Pro 13" (M4)');
  });

  it("bilinmeyen product type için product type string'ini döner (crash etmez)", () => {
    expect(lookupDeviceName('iPhone999,99')).toBe('iPhone999,99');
    expect(lookupDeviceName('UnknownDevice')).toBe('UnknownDevice');
  });

  it('iosDevices map en az 10 cihaz içerir', () => {
    expect(Object.keys(iosDevices).length).toBeGreaterThanOrEqual(10);
  });
});
