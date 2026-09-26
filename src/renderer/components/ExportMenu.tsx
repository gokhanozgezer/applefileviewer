// Dışa aktarma biçim menüsü — tek aksiyonlu Download butonunun yerine geçer.
// ui/select.tsx popover deseni sadeleştirilmiş hali: ikon buton (aria-haspopup)
// + role=menu paneli. Klavye: ok tuşları gezinir, Enter/Space seçer, Esc kapatır;
// dışarı tıklama kapatır.
import * as React from 'react';
import { Download } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import type { ExportCopyMediaBatchResult, ExportSaveRequest } from '@shared/ipc';
import { notify } from './ui/toast';
import { L } from '../i18n';

export interface ExportMenuOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly ExportMenuOption<T>[];
  onSelect: (value: T) => void;
  /** Buton için erişilebilir etiket (title olarak da kullanılır). */
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}

export function ExportMenu<T extends string>({
  options,
  onSelect,
  'aria-label': ariaLabel,
  disabled,
  className,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const id = React.useId();

  const openMenu = () => {
    setActiveIndex(0);
    setOpen(true);
  };

  const closeMenu = React.useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const commit = (index: number) => {
    const opt = options[index];
    closeMenu(true);
    if (opt) onSelect(opt.value);
  };

  // Dışarı tıklama → kapat (odak geri verilmez; kullanıcı başka yere tıkladı).
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Açılınca odak menüye geçer.
  React.useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => (open ? closeMenu(true) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openMenu();
          }
        }}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40"
      >
        <Download className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="menu"
          tabIndex={-1}
          aria-label={L.exportMenu.menuAria}
          aria-activedescendant={`${id}-opt-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="absolute right-0 z-50 mt-1 min-w-44 whitespace-nowrap rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-md)] focus:outline-none"
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              id={`${id}-opt-${i}`}
              role="menuitem"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(i)}
              className={`cursor-pointer px-3 py-1.5 text-xs transition-colors duration-fast ${
                i === activeIndex ? 'bg-surface-2 text-text' : 'text-text-muted'
              }`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Ortak export geri bildirimi ─────────────────────────────────────────────
// Tüm route'lar aynı bildirim desenini kullanır (Messages/Contacts/Photos ile tutarlı):
// kaydedildi → success(yol), hata → error, iptal → sessiz.

/** export.save sonucunu bildirir. İptal sessizdir. */
export async function runExportSave(req: ExportSaveRequest): Promise<void> {
  try {
    const res = await window.api.export.save(req);
    if (res.saved) notify.success(`${L.export.saved}: ${res.path}`);
    else if (res.error) notify.error(`${L.export.error}: ${res.error}`);
  } catch (err) {
    notify.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Klasöre çoklu yazma (copyMediaBatch / notesFolder) sonucunu bildirir:
 * iptal → sessiz; hiç yazılamadı → error; kısmi → warning; tam → success(klasör).
 */
export async function runFolderExport(
  run: () => Promise<ExportCopyMediaBatchResult>,
): Promise<void> {
  try {
    const res = await run();
    if (res.canceled) return;
    const detail = res.errors[0] ? ` — ${res.errors[0]}` : '';
    if (res.copied === 0) {
      notify.error(`${L.export.error}${detail}`);
    } else if (res.failed > 0) {
      notify.warning(
        `${res.copied} ${L.export.filesExportedSuffix}, ${res.failed} ${L.export.filesFailedSuffix}${detail}`,
      );
    } else {
      notify.success(`${res.copied} ${L.export.filesExportedSuffix} → ${res.dir ?? ''}`);
    }
  } catch (err) {
    notify.error(`${L.export.error}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
