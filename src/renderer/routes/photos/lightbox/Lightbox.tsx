import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  X,
  Info,
  Star,
  Maximize2,
  Download,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { PhotoMeta } from '@shared/domain';
import { L } from '../../../i18n';
import { dateLocale } from '../../../i18n/dateLocale';
import { clampZoom, useLightbox } from './useLightbox';
import { ExifPanel } from './ExifPanel';

interface Props {
  items: PhotoMeta[];
  udid: string;
  rootPath: string;
  // Aktif foto index'i (parent state — overlay navigasyonu parent'ta tutulur).
  index: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}

const HEIC_EXTS = new Set(['HEIC', 'HEIF']);

// Foto için kaynak URL. HEIC/HEIF Chromium'da decode edilemez → handler'ın
// JPEG'e çevirdiği TAM ÇÖZÜNÜRLÜK orig'i kullan (orig?as=jpeg, max 4096 kenar).
// thumb (max 1024) yerine — Lightbox zoom için keskin. JPG/PNG orig direkt.
function imageSrc(udid: string, item: PhotoMeta): string {
  if (HEIC_EXTS.has(item.ext)) {
    return `backup://orig/${udid}/${item.fileId}?as=jpeg`;
  }
  return `backup://orig/${udid}/${item.fileId}`;
}

// PROGRESSIVE: grid'in zaten cache'inde olan 160px thumb. Büyük orig?as=jpeg
// gelene kadar ANINDA gösterilir (boş/spinner yerine bulanık önizleme).
function thumbSrc(udid: string, item: PhotoMeta): string {
  return `backup://thumb/${udid}/${item.fileId}?size=160${item.isVideo ? '&kind=video' : ''}`;
}

// Video oynatıcı: orig (HEVC olabilir) dene → onError → media:preheat (H.264
// transcode) → ready ise src'yi backup://transcoded'a çevir. Transcode
// sırasında spinner + "dönüştürülüyor" mesajı. preheat fail → loadError.
type VideoState = 'orig' | 'transcoding' | 'transcoded' | 'error';

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function VideoPlayer({
  udid,
  item,
  videoRef,
}: {
  udid: string;
  item: PhotoMeta;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const [state, setState] = useState<VideoState>('orig');

  // Foto değişince orig'e sıfırla (key remount de yapar ama güvenlik için)
  useEffect(() => {
    setState('orig');
  }, [item.fileId]);

  const onOrigError = useCallback(() => {
    setState('transcoding');
    void window.api.media
      .preheat({ udid, fileId: item.fileId, to: 'mp4' })
      .then((res) => setState(res.ready ? 'transcoded' : 'error'))
      .catch(() => setState('error'));
  }, [udid, item.fileId]);

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <ImageOff className="h-10 w-10 text-text-subtle" strokeWidth={1.5} />
        <p className="text-sm text-text">{L.lightbox.loadError}</p>
      </div>
    );
  }

  if (state === 'transcoding') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" strokeWidth={1.5} />
        <p className="text-sm text-text-muted">{L.lightbox.videoTranscoding}</p>
      </div>
    );
  }

  const src =
    state === 'transcoded'
      ? `backup://transcoded/${udid}/${item.fileId}?to=mp4`
      : `backup://orig/${udid}/${item.fileId}`;

  return (
    <video
      key={`${item.fileId}-${state}`}
      ref={videoRef}
      src={src}
      controls
      autoPlay
      onError={state === 'orig' ? onOrigError : () => setState('error')}
      className="max-h-full max-w-full object-contain"
    />
  );
}

function metaLine(item: PhotoMeta): string {
  const parts: string[] = [item.filename];
  if (item.dateTakenIso) {
    parts.push(format(new Date(item.dateTakenIso), 'd MMM yyyy HH:mm', { locale: dateLocale() }));
  }
  if (item.width != null && item.height != null) {
    parts.push(`${item.width}×${item.height}`);
  }
  return parts.join(' · ');
}

function IconButton({
  label,
  onClick,
  active,
  pressed,
  title,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  /** Toggle butonları için aria-pressed (ör. EXIF paneli). */
  pressed?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md outline-none transition-colors duration-fast hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent ${
        active ? 'bg-surface-2 text-accent' : 'text-text-muted'
      }`}
    >
      {children}
    </button>
  );
}

export function Lightbox({ items, udid, rootPath, index, onClose, onNavigate }: Props) {
  const lb = useLightbox(index);
  const { setZoom, resetZoom } = lb;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLoader, setShowLoader] = useState(false);

  // Pan & zoom — perf: pan ref'te tutulur, transform doğrudan style mutation
  // ile uygulanır (mousemove başına React state churn YOK — low-end hedef).
  const stageRef = useRef<HTMLDivElement | null>(null); // içerik alanı (viewport)
  const wrapRef = useRef<HTMLDivElement | null>(null); // transform uygulanan katman
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const wheelIdleTimer = useRef<number | null>(null);

  const item = items[index];
  const isVideo = !!item?.isVideo;

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  // Pan sınırı: görüntü kenarları viewport kenarından kopmasın. Eksende taşma
  // yoksa (scaled boyut ≤ viewport) o eksende pan = 0.
  const getMaxPan = useCallback((zoom: number) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (img.clientWidth * zoom - stage.clientWidth) / 2),
      y: Math.max(0, (img.clientHeight * zoom - stage.clientHeight) / 2),
    };
  }, []);

  const applyTransform = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const { x, y } = panRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${zoomRef.current})`;
  }, []);

  // Zoom/index/load değişince pan'ı yeni sınırlara kıskaçla + transform uygula.
  // zoom=1'de maxPan=0 → pan otomatik sıfırlanır (reset/navigate senaryosu).
  useLayoutEffect(() => {
    zoomRef.current = lb.zoom;
    const max = getMaxPan(lb.zoom);
    panRef.current = {
      x: clampNum(panRef.current.x, -max.x, max.x),
      y: clampNum(panRef.current.y, -max.y, max.y),
    };
    applyTransform();
  }, [lb.zoom, index, loading, imgError, getMaxPan, applyTransform]);

  const prev = useCallback(() => {
    if (index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const next = useCallback(() => {
    if (index < items.length - 1) onNavigate(index + 1);
  }, [index, items.length, onNavigate]);

  const onDownload = useCallback(async () => {
    if (!item) return;
    try {
      const res = await window.api.export.copyMedia({
        udid,
        rootPath,
        fileId: item.fileId,
        suggestedName: item.filename,
      });
      if (res.saved) toast.success(`${L.export.saved}: ${res.path}`);
      else if (res.error) toast.error(`${L.export.error}: ${res.error}`);
    } catch (err) {
      toast.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [item, udid, rootPath]);

  const toggleFullscreen = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  // Foto değişince loading/error sıfırla
  useEffect(() => {
    setImgError(false);
    setLoading(true);
  }, [index]);

  // Loader 300ms threshold (anti-pattern: 0ms flash yasak)
  useEffect(() => {
    if (!loading) {
      setShowLoader(false);
      return;
    }
    const t = window.setTimeout(() => setShowLoader(true), 300);
    return () => window.clearTimeout(t);
  }, [loading, index]);

  // Açılınca overlay'e focus (focus trap girişi); kapanınca focus'u önceki
  // elemana (tetikleyen grid tile) geri ver.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    overlayRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  // Wheel zoom — cursor noktası etrafında (imleç altındaki piksel sabit kalır).
  // Native listener: React onWheel root'ta passive → preventDefault çalışmaz;
  // Ctrl+wheel'in Chromium page-zoom'unu da engellemek için passive:false şart.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || isVideo || imgError) return;
    const onWheel = (e: WheelEvent) => {
      // EXIF paneli (aside, overflow-y-auto) üzerinde wheel = panel scroll'u.
      if (e.target instanceof HTMLElement && e.target.closest('aside')) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const z0 = zoomRef.current;
      const z1 = clampZoom(z0 * Math.exp(-delta * 0.0015));
      if (z1 === z0) return;
      const rect = stage.getBoundingClientRect();
      // Cursor'un viewport merkezine göre offset'i (transform-origin = merkez).
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      const ratio = z1 / z0;
      const max = getMaxPan(z1);
      panRef.current = {
        x: clampNum(cx - (cx - panRef.current.x) * ratio, -max.x, max.x),
        y: clampNum(cy - (cy - panRef.current.y) * ratio, -max.y, max.y),
      };
      zoomRef.current = z1;
      // Wheel akarken transition kapat (rubber-band lag olmasın); idle'da aç.
      const wrap = wrapRef.current;
      if (wrap) {
        wrap.style.transition = 'none';
        applyTransform();
      }
      if (wheelIdleTimer.current != null) window.clearTimeout(wheelIdleTimer.current);
      wheelIdleTimer.current = window.setTimeout(() => {
        if (wrapRef.current && !dragRef.current) wrapRef.current.style.transition = '';
      }, 200);
      setZoom(z1);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', onWheel);
      if (wheelIdleTimer.current != null) window.clearTimeout(wheelIdleTimer.current);
    };
  }, [isVideo, imgError, getMaxPan, applyTransform, setZoom]);

  // Pan (zoom > 1): pointer drag, grab/grabbing cursor. Pointer capture ile
  // drag viewport dışına taşsa da devam eder. Drag sırasında transition kapalı.
  const onStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || zoomRef.current <= 1) return;
    const el = wrapRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    el.style.transition = 'none';
    el.style.cursor = 'grabbing';
    e.preventDefault();
  }, []);

  const onStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      const max = getMaxPan(zoomRef.current);
      panRef.current = {
        x: clampNum(panRef.current.x + dx, -max.x, max.x),
        y: clampNum(panRef.current.y + dy, -max.y, max.y),
      };
      applyTransform();
    },
    [getMaxPan, applyTransform],
  );

  const onStagePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    const el = wrapRef.current;
    if (el) {
      el.style.transition = '';
      el.style.cursor = '';
    }
  }, []);

  // Double-click: fit (1x) ↔ 2x toggle, merkez = tıklama noktası (lightbox.md).
  const onStageDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (zoomRef.current > 1.001) {
        panRef.current = { x: 0, y: 0 };
        resetZoom();
        return;
      }
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      // 2x'te tıklanan nokta sabit kalsın: pan = c - (c - 0) * 2 = -c.
      const max = getMaxPan(2);
      panRef.current = { x: clampNum(-cx, -max.x, max.x), y: clampNum(-cy, -max.y, max.y) };
      setZoom(2);
    },
    [getMaxPan, resetZoom, setZoom],
  );

  // ±1 komşu preload (akıcılık) — DOM dışı new Image() ile prefetch.
  useEffect(() => {
    const neighbors = [items[index - 1], items[index + 1]].filter(
      (n): n is PhotoMeta => !!n && !n.isVideo,
    );
    for (const n of neighbors) {
      const img = new Image();
      img.src = imageSrc(udid, n);
    }
  }, [items, index, udid]);

  // Klavye — window listener, cleanup
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Mod tuşlu kombinasyonları (Cmd/Ctrl) burada ele alma; serbest bırak.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowRight':
          e.preventDefault();
          next();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prev();
          break;
        case '+':
        case '=':
          e.preventDefault();
          lb.zoomIn();
          break;
        case '-':
          e.preventDefault();
          lb.zoomOut();
          break;
        case '0':
          e.preventDefault();
          lb.resetZoom();
          break;
        case '1': {
          // Actual size (%100 — 1:1 piksel). Zoom modeli fit-tabanlı (1 = fit):
          // gösterilen asset'in natural/fit oranı = gerçek boyut çarpanı.
          e.preventDefault();
          const img = imgRef.current;
          if (img && img.naturalWidth > 0 && img.clientWidth > 0) {
            lb.setZoom(img.naturalWidth / img.clientWidth);
          }
          break;
        }
        case ' ': {
          // Space = video play/pause (sadece video açıkken). preventDefault →
          // sayfa scroll etmez. Buton/form/video odaklıysa native davranışa bırak.
          if (!isVideo) break;
          const t = e.target;
          if (t instanceof HTMLElement && t.closest('button, input, textarea, select, video')) {
            break;
          }
          e.preventDefault();
          const v = videoRef.current;
          if (v) {
            if (v.paused) void v.play().catch(() => undefined);
            else v.pause();
          }
          break;
        }
        case 'Tab': {
          // Focus trap: Tab/Shift+Tab lightbox içinde döner (dialog dışına çıkmaz).
          const root = overlayRef.current;
          if (!root) break;
          const focusables = Array.from(
            root.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, video, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter(
            (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
          );
          if (focusables.length === 0) {
            e.preventDefault();
            root.focus();
            break;
          }
          const first = focusables[0]!;
          const last = focusables[focusables.length - 1]!;
          const active = document.activeElement;
          const inside = active instanceof HTMLElement && root.contains(active);
          if (!inside) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          } else if (e.shiftKey && (active === first || active === root)) {
            e.preventDefault();
            last.focus();
          }
          break;
        }
        case 'i':
        case 'I':
          e.preventDefault();
          lb.toggleExif();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb, onClose, prev, next, toggleFullscreen, isVideo]);

  // Foto bulunamadı (geçersiz index)
  if (!item) {
    return (
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label={L.lightbox.viewerAria}
        tabIndex={-1}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-surface/[0.98] text-center outline-none backdrop-blur-xl"
      >
        <ImageOff className="h-10 w-10 text-text-subtle" strokeWidth={1.5} />
        <p className="text-sm text-text">{L.lightbox.notFound}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-surface-2 px-3 py-1.5 text-sm font-medium text-text transition-colors duration-fast hover:bg-surface"
        >
          {L.lightbox.backToGallery}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={L.lightbox.viewerAria}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-surface/[0.98] outline-none backdrop-blur-xl"
    >
      {/* Top bar 56px */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3">
        <IconButton label={L.lightbox.closeAria} onClick={onClose}>
          <X className="h-5 w-5" strokeWidth={1.5} />
        </IconButton>
        <span className="shrink-0 font-mono text-sm tabular-nums text-text-muted">
          {index + 1} / {items.length}
        </span>
        <span className="truncate text-sm text-text-muted">{metaLine(item)}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Toggle: sabit etiket "Detayı göster" + aria-pressed; tooltip kısayolu da söyler. */}
          <IconButton
            label={L.lightbox.showDetail}
            title={`${L.lightbox.exifAria} (I)`}
            onClick={lb.toggleExif}
            active={lb.exifOpen}
            pressed={lb.exifOpen}
          >
            <Info className="h-5 w-5" strokeWidth={1.5} />
          </IconButton>
          {item.isFavorite && (
            <div
              role="img"
              aria-label={L.lightbox.starAria}
              title={L.lightbox.starAria}
              className="flex h-8 w-8 items-center justify-center text-amber-500"
            >
              <Star className="h-5 w-5 fill-current" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
          <IconButton label={L.lightbox.fullscreenAria} onClick={toggleFullscreen}>
            <Maximize2 className="h-5 w-5" strokeWidth={1.5} />
          </IconButton>
          {/* Download — orijinal medya dosyasını dışarı kopyala (copyFileOut). */}
          <IconButton label={L.lightbox.downloadAria} onClick={onDownload}>
            <Download className="h-5 w-5" strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      {/* İçerik alanı */}
      <div
        ref={stageRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
      >
        {imgError ? (
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <ImageOff className="h-10 w-10 text-text-subtle" strokeWidth={1.5} />
            <p className="text-sm text-text">{L.lightbox.loadError}</p>
          </div>
        ) : isVideo ? (
          <VideoPlayer key={item.fileId} udid={udid} item={item} videoRef={videoRef} />
        ) : (
          /* Transform katmanı: translate(pan) + scale(zoom) — effect/drag'de ref
             üzerinden mutate edilir (JSX'te transform yok). Drag/wheel sırasında
             transition inline 'none' ile kapatılır. */
          <div
            ref={wrapRef}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerEnd}
            onPointerCancel={onStagePointerEnd}
            onDoubleClick={onStageDoubleClick}
            className={`relative flex h-full w-full select-none items-center justify-center transition-transform duration-fast ease-standard motion-reduce:transition-none ${
              lb.zoom > 1 ? 'cursor-grab' : ''
            }`}
          >
            {/* PROGRESSIVE alt katman: cache'li 160px thumb — anında, hafif bulanık.
                Büyük orig yüklenince üst katman opak olur → bu görünmez kalır. */}
            {loading && (
              <img
                key={`thumb-${item.fileId}`}
                src={thumbSrc(udid, item)}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute max-h-full max-w-full scale-105 object-contain blur-md"
              />
            )}
            <img
              key={item.fileId}
              ref={imgRef}
              src={imageSrc(udid, item)}
              alt={item.filename}
              draggable={false}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setImgError(true);
              }}
              className={`max-h-full max-w-full object-contain transition-opacity duration-base ease-standard motion-reduce:transition-none ${
                loading ? 'opacity-0' : 'opacity-100'
              }`}
            />
          </div>
        )}

        {/* Loading spinner (>300ms) */}
        {showLoader && !imgError && !isVideo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" strokeWidth={1.5} />
          </div>
        )}

        {/* Carousel butonları — DAİMA görünür (hover değil), ~48px yarı-saydam
            daire, dikey ortada kenarlarda. Sınırda gizli (ilk/son fotoda). */}
        {hasPrev && (
          <button
            type="button"
            aria-label={L.lightbox.prevAria}
            onClick={prev}
            className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white opacity-90 outline-none backdrop-blur-sm transition-all duration-fast hover:bg-black/60 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            aria-label={L.lightbox.nextAria}
            onClick={next}
            className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white opacity-90 outline-none backdrop-blur-sm transition-all duration-fast hover:bg-black/60 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight className="h-7 w-7" strokeWidth={1.75} />
          </button>
        )}

        {/* EXIF panel */}
        <ExifPanel item={item} open={lb.exifOpen} />
      </div>
    </div>
  );
}
