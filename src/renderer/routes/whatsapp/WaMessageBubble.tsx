import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FileX, CloudOff, X } from 'lucide-react';
import type { WaMedia, WaMessage } from '@shared/domain';
import { L } from '../../i18n';
import { formatBubbleTime } from '../messages/dateUtils';

/**
 * WhatsApp medya tam-ekran önizleme overlay'i (tek görsel — galeri navigasyonu yok,
 * sohbet bağlamında tek tık doğal). Esc veya backdrop tık ile kapanır.
 * Photos Lightbox'ı çok-item/EXIF odaklı olduğundan WhatsApp için basit overlay.
 */
function ImageOverlay({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // BUG B: react-window list item'ı virtualization için `transform` kullanır →
  // position:fixed o transform'lu ancestor'a göre konumlanır (viewport DEĞİL) → overlay
  // bubble içinde "15px" küçük kalır. createPortal ile document.body'ye taşı → fixed
  // gerçek viewport'a göre → tam ekran. (Photos Lightbox route-seviyesinde, bu sorunu yok.)
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label={L.lightbox.closeAria}
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white outline-none transition-colors duration-fast hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-5 w-5" strokeWidth={1.5} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full object-contain"
      />
    </div>,
    document.body,
  );
}

interface WaMessageBubbleProps {
  message: WaMessage;
  udid: string;
  showSender: boolean;
}

/**
 * Gelen → sol, surface-2 bg, --text.
 * Giden → sağ, --wa-out bg (klasik WhatsApp yeşil), --wa-out-text.
 * Grup gelen mesajında gönderen adı balonun üstünde.
 * Sistem mesajı (text yok + medya yok) → ortada italik gri placeholder.
 */
export function WaMessageBubble({ message, udid, showSender }: WaMessageBubbleProps) {
  const out = message.isFromMe;
  const time = formatBubbleTime(message.dateIso);

  const bubbleColor = out ? 'bg-wa-out text-wa-out-text' : 'bg-surface-2 text-text';
  const radius = out ? 'rounded-[18px] rounded-br-[4px]' : 'rounded-[18px] rounded-bl-[4px]';
  const hasText = (message.text ?? '').trim().length > 0;

  // Sistem mesajı: metin de medya da yok (ZMESSAGETYPE 6/10/15 vb.) → boş satır DEĞİL,
  // ortada italik gri "Bu mesaj görüntülenemiyor".
  if (!hasText && !message.media) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs italic text-text-subtle">
          {L.whatsapp.systemMessageUnavailable}
        </span>
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-2 ${out ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex max-w-[min(540px,70%)] flex-col gap-1 ${out ? 'items-end' : 'items-start'}`}
      >
        {!out && showSender && (
          <span className="px-1 text-xs font-medium text-wa-accent">
            {message.senderName ?? L.whatsapp.unknownSender}
          </span>
        )}
        {message.media && <MediaView media={message.media} udid={udid} out={out} />}
        {hasText && (
          <div
            className={`${bubbleColor} ${radius} px-3 py-2 text-[15px] leading-[1.45] [overflow-wrap:anywhere]`}
          >
            {message.text}
          </div>
        )}
      </div>
      {time && (
        <span className="shrink-0 pb-1 text-xs tabular-nums text-text-subtle opacity-0 transition-opacity duration-fast group-hover:opacity-100">
          {time}
        </span>
      )}
    </div>
  );
}

function MediaView({ media, udid, out }: { media: WaMedia; udid: string; out: boolean }) {
  const [error, setError] = useState(false);
  // Ses opus/m4a Chromium'da oynamazsa transcoded mp3'e düş.
  const [audioFallback, setAudioFallback] = useState(false);
  // BUG B — medya görseline tıklayınca tam-ekran overlay aç (Photos gibi).
  const [overlayOpen, setOverlayOpen] = useState(false);

  const label = media.title || baseName(media.localPath);

  // BUG 1 — fileId null (ZMEDIALOCALPATH + ZXMPPTHUMBPATH ikisi de NULL): medya hiç
  // indirilmemiş (kullanıcının yedeğinde 32423 mesaj). "bulunamadı" YANLIŞ → CloudOff
  // ile "Medya indirilmemiş". fileId varsa ama disk okuması başarısızsa (error) →
  // gerçekten yedekte yok → "bulunamadı".
  if (!media.fileId) {
    return (
      <div
        className={`flex items-center gap-2 rounded-[14px] border border-border bg-surface-2 px-3 py-2 text-xs italic text-text-subtle ${
          out ? 'self-end' : 'self-start'
        }`}
      >
        <CloudOff className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="shrink-0">{L.whatsapp.mediaNotDownloaded}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center gap-2 rounded-[14px] border border-border bg-surface-2 px-3 py-2 text-xs italic text-text-muted ${
          out ? 'self-end' : 'self-start'
        }`}
      >
        <FileX className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className="truncate font-mono not-italic">{label}</span>
        <span className="shrink-0">— {L.whatsapp.attachmentMissing}</span>
      </div>
    );
  }

  const origUrl = `backup://orig/${udid}/${media.fileId}`;
  const thumbUrl = `backup://thumb/${udid}/${media.fileId}?size=256`;

  if (media.kind === 'image') {
    // Tam-ekran için orig?as=jpeg (HEIC/HEIF de Chromium'da render olsun).
    const fullUrl = `${origUrl}?as=jpeg`;
    return (
      <>
        <img
          src={thumbUrl}
          loading="lazy"
          decoding="async"
          alt={label}
          onClick={() => setOverlayOpen(true)}
          onError={() => setError(true)}
          className="max-h-80 cursor-pointer rounded-md object-contain"
        />
        {overlayOpen && (
          <ImageOverlay src={fullUrl} alt={label} onClose={() => setOverlayOpen(false)} />
        )}
      </>
    );
  }

  if (media.kind === 'video') {
    // P1 worker pool ?kind=video → ffmpeg ilk frame poster. controls + preload=none.
    return (
      <video
        src={origUrl}
        poster={`${thumbUrl}&kind=video`}
        controls
        preload="none"
        onError={() => setError(true)}
        className="max-h-80 rounded-md"
      />
    );
  }

  if (media.kind === 'audio') {
    // opus/m4a → önce orig; oynamazsa transcoded mp3 fallback (ffmpeg).
    const audioSrc = audioFallback ? `backup://transcoded/${udid}/${media.fileId}?to=mp3` : origUrl;
    return (
      <audio
        key={audioFallback ? 'mp3' : 'orig'}
        src={audioSrc}
        controls
        preload="none"
        onError={() => (audioFallback ? setError(true) : setAudioFallback(true))}
        className="w-64"
      />
    );
  }

  // Document — ikon + ad (ZTITLE) + indir linki
  return (
    <a
      href={origUrl}
      download={label}
      className="flex items-center gap-2 rounded-[14px] border border-border bg-surface-2 px-3 py-2 text-sm text-text transition-colors duration-fast hover:bg-surface"
    >
      <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} />
      <span className="max-w-[280px] truncate font-mono text-xs">{label}</span>
    </a>
  );
}

function baseName(p: string): string {
  if (!p) return L.common.attachmentFallback;
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
