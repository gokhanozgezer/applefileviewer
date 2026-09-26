import { Fragment } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { L } from '../i18n';
import {
  SHORTCUTS,
  SHORTCUT_GROUP_ORDER,
  formatShortcut,
  shortcutParts,
  type ShortcutDef,
  type ShortcutGroup,
} from '../keymap';
import { getPlatform, type UiPlatform } from '../lib/platform';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Ctrl+1" → ayrı <kbd> parçaları; '?' gibi tek tuşlar tek <kbd>. macOS'ta modifier'lar
 * sembolle (⌘ ⌥ ⇧) ve ayraçsız gösterilir (Apple konvansiyonu: ⌘ 1).
 */
function Keys({ keys, platform }: { keys: string; platform: UiPlatform }) {
  const parts = shortcutParts(keys, platform);
  const mac = platform === 'darwin';
  return (
    <span className="flex items-center gap-1" title={formatShortcut(keys, platform)}>
      {parts.map((part, i) => (
        <Fragment key={`${part}-${i}`}>
          {i > 0 && !mac && (
            <span aria-hidden="true" className="text-xs text-text-subtle">
              +
            </span>
          )}
          <kbd className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text">
            {part}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

/** Birincil + alternatif kombinasyonlar ("? veya Ctrl+/"). */
function KeyCombos({ def }: { def: ShortcutDef }) {
  const combos = [def.keys, ...(def.altKeys ?? [])];
  const platform = getPlatform();
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {combos.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && <span className="text-xs text-text-subtle">{L.common.or}</span>}
          <Keys keys={k} platform={platform} />
        </Fragment>
      ))}
    </span>
  );
}

/** Grup başlığı — sözlükte yoksa (ör. yeni bağlamsal bölüm henüz çevrilmemiş) anahtarın kendisi. */
function groupTitle(group: ShortcutGroup): string {
  const groups = L.shortcuts.groups as Record<string, string | undefined>;
  return groups[group] ?? group;
}

function labelOf(def: ShortcutDef): string {
  const labels = L.shortcuts.labels as Record<string, string | undefined>;
  return labels[def.labelKey] ?? def.labelKey;
}

/**
 * Overlay bölüm sırası: SHORTCUT_GROUP_ORDER, ardından tabloda olup sırada
 * yer almayan gruplar (ör. bağlamsal 'photos'/'lightbox' bölümleri) ilk
 * görünme sırasıyla. Boş gruplar atlanır.
 */
export function orderedShortcutSections(
  shortcuts: readonly ShortcutDef[] = SHORTCUTS,
  order: readonly ShortcutGroup[] = SHORTCUT_GROUP_ORDER,
): { group: ShortcutGroup; items: ShortcutDef[] }[] {
  const groups: ShortcutGroup[] = [...order];
  for (const s of shortcuts) if (!groups.includes(s.group)) groups.push(s.group);
  return groups
    .map((group) => ({ group, items: shortcuts.filter((s) => s.group === group) }))
    .filter((sec) => sec.items.length > 0);
}

function GroupSection({ group, items }: { group: ShortcutGroup; items: ShortcutDef[] }) {
  const headingId = `shortcuts-group-${group}`;
  return (
    <section aria-labelledby={headingId} className="break-inside-avoid">
      <h3
        id={headingId}
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle"
      >
        {groupTitle(group)}
      </h3>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4">
            <span className="min-w-0 text-sm text-text-muted">{labelOf(s)}</span>
            <KeyCombos def={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShortcutsHelpDialog({ open, onOpenChange }: Props) {
  const sections = orderedShortcutSections();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L.shortcuts.title}</DialogTitle>
          <DialogDescription>{L.shortcuts.description}</DialogDescription>
        </DialogHeader>
        {/* Bölümler iki sütuna akar (CSS columns) — bağlamsal bölümler eklendikçe
            düzen elle ayarlanmadan dengelenir. */}
        <div className="gap-8 sm:columns-2 [&>section]:mb-6">
          {sections.map(({ group, items }) => (
            <GroupSection key={group} group={group} items={items} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
