import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@renderer/lib/utils';

// Elle yazılmış erişilebilir Select (MASTER §13 — native <select> YASAK).
// Buton (aria-haspopup=listbox) + popover panel (role=listbox / role=option).
// Klavye: Enter/Space/ArrowDown/ArrowUp aç, oklar gezin, Home/End, Enter/Space seç,
// Esc kapat, yazarak arama (type-ahead). Dışarı tıklama kapatır.
// Stil: button.tsx outline varyantı + panel bg-surface border-border rounded-lg
// shadow-[var(--shadow-md)] (MASTER §gölge: shadow-md → dropdown).

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Buton için erişilebilir etiket. */
  'aria-label'?: string;
  /** Değer options içinde yoksa gösterilecek metin. */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  placeholder,
  className,
  disabled,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const typeahead = React.useRef({ query: '', timer: 0 });
  const id = React.useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex]!.label : (placeholder ?? '');

  const openList = React.useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  const closeList = React.useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const commit = React.useCallback(
    (index: number) => {
      const opt = options[index];
      if (opt) onChange(opt.value);
      closeList(true);
    },
    [options, onChange, closeList],
  );

  // Dışarı tıklama → kapat (odak geri VERİLMEZ; kullanıcı başka yere tıkladı).
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Açılınca odak listbox'a geçer; aktif seçenek görünür kalır.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${id}-opt-${activeIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, id]);

  const moveActive = (delta: number) => {
    setActiveIndex((i) => Math.min(options.length - 1, Math.max(0, i + delta)));
  };

  const handleTypeahead = (key: string) => {
    const t = typeahead.current;
    window.clearTimeout(t.timer);
    t.query += key.toLocaleLowerCase('tr');
    t.timer = window.setTimeout(() => {
      t.query = '';
    }, 500);
    const start = t.query.length === 1 ? activeIndex + 1 : activeIndex;
    for (let step = 0; step < options.length; step++) {
      const idx = (start + step) % options.length;
      if (options[idx]!.label.toLocaleLowerCase('tr').startsWith(t.query)) {
        setActiveIndex(idx);
        return;
      }
    }
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
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
        closeList(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          handleTypeahead(e.key);
        }
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? closeList(true) : openList())}
        onKeyDown={onButtonKeyDown}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text shadow-sm transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${id}-opt-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-md)] focus:outline-none"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={opt.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-xs transition-colors duration-fast ${
                  isActive ? 'bg-surface-2 text-text' : 'text-text-muted'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.5} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
