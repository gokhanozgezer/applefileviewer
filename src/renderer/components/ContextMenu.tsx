import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  // Tetiklendiği viewport koordinatı (mouse clientX/clientY).
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  /** Ekran okuyucu için menü adı (opsiyonel). */
  'aria-label'?: string;
}

// Reusable tema-uyumlu context menu. Body portal'ına render olur (fixed),
// mouse pozisyonunda açılır, viewport taşmasına karşı clamp eder, dışarı tıkla
// + Esc + Tab + scroll/resize ile kapanır.
//
// Klavye (WAI-ARIA menu deseni): açılışta ilk öğe odaklanır; ↑/↓ döngüsel,
// Home/End ilk/son; Enter/Space öğeyi çalıştırır (native button). Kapanınca
// odak menüyü açan öğeye (açılış anındaki activeElement) geri döner.
export function ContextMenu({ x, y, items, onClose, 'aria-label': ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });
  // onClose her render'da yeni referans olabilir — listener'ları yeniden kurmamak için ref.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Viewport içinde kalacak şekilde konumu düzelt (ölçüm sonrası).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width + pad > window.innerWidth) nx = window.innerWidth - rect.width - pad;
    if (ny + rect.height + pad > window.innerHeight) ny = window.innerHeight - rect.height - pad;
    setPos({ x: Math.max(pad, nx), y: Math.max(pad, ny) });
  }, [x, y]);

  // Açılışta ilk öğeye odak; kapanışta (unmount) odağı açan öğeye iade et.
  useEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      if (invoker && invoker.isConnected) invoker.focus();
    };
  }, []);

  useEffect(() => {
    const close = () => onCloseRef.current();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Tab') {
        // Global keymap / Lightbox Esc'i de tetiklemesin.
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    // Dışarı tıkla kapat — pointerdown capture (item onClick'ten önce kapanmaması
    // için menü içindeki tıklamayı hariç tut).
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close);
    };
  }, []);

  // Menü içi ok/Home/End gezinmesi — roving focus (DOM odağı üzerinden).
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (nodes.length === 0) return;
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % nodes.length;
    else if (e.key === 'ArrowUp')
      next = current < 0 ? nodes.length - 1 : (current - 1 + nodes.length) % nodes.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = nodes.length - 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    nodes[next]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] min-w-[200px] max-w-[320px] overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            it.onClick();
            onCloseRef.current();
          }}
          title={it.label}
          className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none transition-colors duration-fast hover:bg-surface-2 focus-visible:bg-surface-2 focus:bg-surface-2 ${
            it.danger ? 'text-danger' : 'text-text'
          }`}
        >
          {it.icon && (
            <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
              {it.icon}
            </span>
          )}
          <span className="truncate">{it.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
