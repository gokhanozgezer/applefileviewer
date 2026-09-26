// Source: https://www.theiphonewiki.com/wiki/Models
// Last updated: 2026-05-10
// NOT: Apple yeni cihaz çıkardıkça bu map manuel güncellenir.
// Bilinmeyen product type için lookupDeviceName fallback olarak product type'ın
// kendisini döner — uygulama crash etmez.

export const iosDevices: Record<string, string> = {
  // iPhone 16 ailesi
  'iPhone17,1': 'iPhone 16 Pro',
  'iPhone17,2': 'iPhone 16 Pro Max',
  'iPhone17,3': 'iPhone 16',
  'iPhone17,4': 'iPhone 16 Plus',
  // iPhone 15 ailesi
  'iPhone16,1': 'iPhone 15 Pro',
  'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone15,4': 'iPhone 15',
  'iPhone15,5': 'iPhone 15 Plus',
  // iPhone 14 ailesi
  'iPhone15,2': 'iPhone 14 Pro',
  'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone14,7': 'iPhone 14',
  'iPhone14,8': 'iPhone 14 Plus',
  // iPhone 13 ailesi
  'iPhone14,2': 'iPhone 13 Pro',
  'iPhone14,3': 'iPhone 13 Pro Max',
  'iPhone14,4': 'iPhone 13 mini',
  'iPhone14,5': 'iPhone 13',
  // iPad Pro 13" (M4)
  'iPad16,5': 'iPad Pro 13" (M4)',
  'iPad16,6': 'iPad Pro 13" (M4)',
};

export function lookupDeviceName(productType: string): string {
  return iosDevices[productType] ?? productType;
}
