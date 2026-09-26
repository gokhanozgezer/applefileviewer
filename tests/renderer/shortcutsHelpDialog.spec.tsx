import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ShortcutsHelpDialog,
  orderedShortcutSections,
} from '@renderer/components/ShortcutsHelpDialog';
import { SHORTCUTS, SHORTCUT_GROUP_ORDER, type ShortcutDef } from '@renderer/keymap';
import { L } from '@renderer/i18n';

describe('ShortcutsHelpDialog', () => {
  it('her grup için başlıklı bölüm render eder, öğeler doğru bölümde', () => {
    render(<ShortcutsHelpDialog open onOpenChange={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    for (const group of new Set(SHORTCUTS.map((s) => s.group))) {
      const title = (L.shortcuts.groups as Record<string, string>)[group] ?? group;
      const section = within(dialog).getByRole('region', { name: title });
      const expected = SHORTCUTS.filter((s) => s.group === group);
      expect(within(section).getAllByRole('listitem')).toHaveLength(expected.length);
    }
  });

  it('yardım kısayolu alternatifiyle ("?" veya Ctrl+/) gösterilir', () => {
    render(<ShortcutsHelpDialog open onOpenChange={() => undefined} />);
    const row = screen.getByText(L.shortcuts.labels.help).closest('li')!;
    expect(within(row).getByText('?')).toBeInTheDocument();
    expect(within(row).getByText('/')).toBeInTheDocument();
    expect(within(row).getByText(L.common.or)).toBeInTheDocument();
  });

  it('orderedShortcutSections: sıra dışı (bağlamsal) gruplar sona eklenir, boşlar atlanır', () => {
    const base = SHORTCUTS[0]!;
    const extra = { ...base, id: 'ctx-x', keys: 'X', group: 'zz-test' } as unknown as ShortcutDef;
    const sections = orderedShortcutSections([...SHORTCUTS, extra], SHORTCUT_GROUP_ORDER);
    const groups = sections.map((s) => s.group as string);
    expect(groups.slice(0, SHORTCUT_GROUP_ORDER.length)).toEqual(
      SHORTCUT_GROUP_ORDER.filter((g) => SHORTCUTS.some((s) => s.group === g)),
    );
    expect(groups.at(-1)).toBe('zz-test');
    expect(orderedShortcutSections([], SHORTCUT_GROUP_ORDER)).toEqual([]);
  });

  describe('macOS', () => {
    afterEach(() => {
      (window as unknown as { api: unknown }).api = undefined;
    });

    it('modifier ⌘ sembolüyle gösterilir, "Ctrl" görünmez', () => {
      (window as unknown as { api: unknown }).api = { platform: 'darwin' };
      render(<ShortcutsHelpDialog open onOpenChange={() => undefined} />);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).queryByText('Ctrl')).toBeNull();
      expect(within(dialog).getAllByText('⌘').length).toBeGreaterThan(0);
      expect(within(dialog).getByText('⇧')).toBeInTheDocument(); // Shift+F10
    });
  });

  it('Windows: "Ctrl" metniyle gösterilir', () => {
    (window as unknown as { api: unknown }).api = { platform: 'win32' };
    try {
      render(<ShortcutsHelpDialog open onOpenChange={() => undefined} />);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getAllByText('Ctrl').length).toBeGreaterThan(0);
      expect(within(dialog).queryByText('⌘')).toBeNull();
    } finally {
      (window as unknown as { api: unknown }).api = undefined;
    }
  });
});
