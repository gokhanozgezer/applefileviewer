import { useCallback, useEffect, useState } from 'react';

// Discrete zoom levels (lightbox.md): 1 (fit) → 8x.
export const ZOOM_LEVELS = [1, 1.5, 2, 3, 5, 8] as const;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!;

// Float karşılaştırma toleransı (wheel zoom continuous değer üretir).
const EPS = 0.001;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export interface LightboxState {
  zoom: number;
  exifOpen: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  // Continuous zoom (wheel/dblclick/1-tuşu) — [MIN_ZOOM, MAX_ZOOM] aralığına kıskaçlanır.
  setZoom: (v: number) => void;
  toggleExif: () => void;
  setExifOpen: (v: boolean) => void;
}

// Overlay refactor: navigasyon (idx) artık parent state (PhotosRoute.lightboxIndex)
// tarafından sahiplenilir; bu hook yalnızca lightbox-local UI state (zoom + exif)
// tutar. `index` değişince zoom otomatik 1'e sıfırlanır (foto değişti).
// Zoom artık continuous olabilir (wheel); +/- bir üst/alt discrete seviyeye atlar.
export function useLightbox(index: number): LightboxState {
  const [zoom, setZoomState] = useState(1);
  const [exifOpen, setExifOpen] = useState(false);

  // Foto değişince zoom reset (fit).
  useEffect(() => {
    setZoomState(1);
  }, [index]);

  const zoomIn = useCallback(() => {
    setZoomState((z) => ZOOM_LEVELS.find((l) => l > z + EPS) ?? MAX_ZOOM);
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState((z) => [...ZOOM_LEVELS].reverse().find((l) => l < z - EPS) ?? MIN_ZOOM);
  }, []);

  const resetZoom = useCallback(() => setZoomState(1), []);
  const setZoom = useCallback((v: number) => setZoomState(clampZoom(v)), []);
  const toggleExif = useCallback(() => setExifOpen((v) => !v), []);

  return { zoom, exifOpen, zoomIn, zoomOut, resetZoom, setZoom, toggleExif, setExifOpen };
}
