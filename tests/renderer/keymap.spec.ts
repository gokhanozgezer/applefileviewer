import { describe, it, expect } from 'vitest';
import {
  SHORTCUTS,
  matchesShortcut,
  shortcutById,
  hasPrimaryModifier,
  shortcutParts,
  formatShortcut,
} from '@renderer/keymap';

function key(k: string, mods: Partial<KeyboardEventInit> = {}) {
  return new KeyboardEvent('keydown', { key: k, ...mods });
}

describe('keymap', () => {
  it('id değerleri benzersiz', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('aynı bağlamda (scope) yinelenen tuş kombinasyonu yok (alternatifler dahil)', () => {
    const seen = new Map<string, string>();
    for (const s of SHORTCUTS) {
      for (const combo of [s.keys, ...(s.altKeys ?? [])]) {
        const k = `${String(s.scope)}|${combo.toLowerCase()}`;
        expect(seen.get(k), `${combo}: ${seen.get(k)} / ${s.id}`).toBeUndefined();
        seen.set(k, s.id);
      }
    }
  });

  it('bir tuş olayı en fazla bir global kısayolla eşleşir', () => {
    const probes = [
      ...'123456789bkf,/?'.split('').map((c) => key(c, { ctrlKey: true })),
      key('?'),
      key('/', { ctrlKey: true, shiftKey: true }),
    ];
    for (const e of probes) {
      const hits = SHORTCUTS.filter((s) => s.scope === 'global' && matchesShortcut(e, s));
      expect(hits.length, `${e.key} ctrl=${e.ctrlKey}`).toBeLessThanOrEqual(1);
    }
  });

  it('yardım: "?" ve Ctrl+/ ikisi de eşleşir; düz "/" eşleşmez', () => {
    const help = shortcutById('help')!;
    expect(matchesShortcut(key('?', { shiftKey: true }), help)).toBe(true);
    expect(matchesShortcut(key('/', { ctrlKey: true }), help, 'win32')).toBe(true);
    expect(matchesShortcut(key('/', { metaKey: true }), help, 'win32')).toBe(true);
    expect(matchesShortcut(key('/'), help, 'win32')).toBe(false);
    expect(help.altKeys).toContain('Ctrl+/');
  });

  it('macOS: birincil modifier ⌘ — Ctrl tek başına eşleşmez (Ctrl+1 = Mission Control)', () => {
    const nav = shortcutById('nav-photos')!;
    expect(matchesShortcut(key('2', { metaKey: true }), nav, 'darwin')).toBe(true);
    expect(matchesShortcut(key('2', { ctrlKey: true }), nav, 'darwin')).toBe(false);
    expect(matchesShortcut(key('2', { ctrlKey: true, metaKey: true }), nav, 'darwin')).toBe(false);
    const palette = shortcutById('open-palette')!;
    expect(matchesShortcut(key('k', { metaKey: true }), palette, 'darwin')).toBe(true);
    expect(matchesShortcut(key('f', { metaKey: true }), palette, 'darwin')).toBe(true);
    expect(matchesShortcut(key('k', { ctrlKey: true }), palette, 'darwin')).toBe(false);
    const help = shortcutById('help')!;
    expect(matchesShortcut(key('/', { metaKey: true }), help, 'darwin')).toBe(true);
    expect(matchesShortcut(key('/', { ctrlKey: true }), help, 'darwin')).toBe(false);
    expect(matchesShortcut(key('?', { shiftKey: true }), help, 'darwin')).toBe(true);
  });

  it('Windows/Linux: Ctrl birincil modifier', () => {
    const nav = shortcutById('nav-photos')!;
    for (const p of ['win32', 'linux'] as const) {
      expect(matchesShortcut(key('2', { ctrlKey: true }), nav, p)).toBe(true);
      expect(matchesShortcut(key('2'), nav, p)).toBe(false);
      expect(matchesShortcut(key('2', { ctrlKey: true, altKey: true }), nav, p)).toBe(false);
    }
    expect(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, 'linux')).toBe(true);
    expect(hasPrimaryModifier({ ctrlKey: true, metaKey: false }, 'darwin')).toBe(false);
  });

  it('görüntüleme: macOS sembolleri (⌘ ⌥ ⇧) ayraçsız; Windows/Linux "Ctrl+B"', () => {
    expect(formatShortcut('Ctrl+B', 'win32')).toBe('Ctrl+B');
    expect(formatShortcut('Ctrl+B', 'linux')).toBe('Ctrl+B');
    expect(formatShortcut('Ctrl+B', 'darwin')).toBe('⌘B');
    expect(formatShortcut('Ctrl+,', 'darwin')).toBe('⌘,');
    expect(formatShortcut('Shift+F10', 'darwin')).toBe('⇧F10');
    expect(formatShortcut('Ctrl+Alt+X', 'darwin')).toBe('⌘⌥X');
    expect(shortcutParts('Ctrl+1', 'darwin')).toEqual(['⌘', '1']);
    expect(shortcutParts('Ctrl++', 'win32')).toEqual(['Ctrl', '+']);
    expect(shortcutParts('+', 'win32')).toEqual(['+']);
    expect(shortcutParts('?', 'darwin')).toEqual(['?']);
  });
});
