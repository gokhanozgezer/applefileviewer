// src/shared/preloadApi.ts
import type { AppAPI } from '../preload';

declare global {
  interface Window {
    api: AppAPI;
  }
}

export {};
