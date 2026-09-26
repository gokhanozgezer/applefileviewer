// Renderer test ortamı — jsdom + jest-dom matcher'ları + window.api mock iskeleti.
import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom'da olmayan tarayıcı API'leri
if (!('ResizeObserver' in globalThis)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: RO, writable: true });
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// Testler kendi window.api mock'unu kurar; burada güvenli varsayılan iskelet.
// (preload gerçek yüzeyi: tests/renderer/apiMock.ts)
Object.defineProperty(window, 'api', {
  writable: true,
  value: undefined,
});
