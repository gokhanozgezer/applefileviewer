// src/renderer/hooks/useGlobalKeymap.ts
// Tek window keydown listener — keymap.ts tablosundan binding üretir.
// AppShellLayout'ta BİR KEZ mount edilir.
//
// Kurallar:
// - input/textarea/select/contenteditable odaktayken düz tuşlar yutulmaz
//   (arama kutusu vs. bozulmaz); Ctrl/Cmd kombinasyonları her yerde çalışır.
// - Modifier'sız tuşlara (Esc, ok, +/-/0/I/F ...) DOKUNULMAZ — Lightbox ve
//   lokal handler'lar bunları kendisi ele alır. Tek istisna: '?' (help overlay),
//   o da yalnızca edit alanı odakta DEĞİLKEN.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { SHORTCUTS, matchesShortcut } from '../keymap';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useGlobalKeymap() {
  const navigate = useNavigate();
  const { udid } = useParams<{ udid: string }>();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  // Palet state'i uiStore'da — TitleBar'daki arama butonu da aynı paleti açar
  // (CommandPalette App.tsx RootLayout'ta BİR KEZ mount edilir).
  const togglePalette = useUIStore((s) => s.togglePalette);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const hasMod = e.ctrlKey || e.metaKey;
      // Edit alanı odaktayken yalnızca Ctrl/Cmd kombinasyonlarına izin ver.
      if (isEditableTarget(e.target) && !hasMod) return;

      for (const def of SHORTCUTS) {
        if (!matchesShortcut(e, def)) continue;

        if (def.id === 'toggle-sidebar') {
          e.preventDefault();
          toggleSidebar();
        } else if (def.id === 'open-settings') {
          e.preventDefault();
          navigate('/settings');
        } else if (def.id === 'help') {
          e.preventDefault();
          setHelpOpen((v) => !v);
        } else if (def.id === 'open-palette') {
          // Ctrl+K / Ctrl+F — input odaktayken de çalışır (hasMod true olduğundan
          // yukarıdaki editable guard'ını zaten geçer).
          e.preventDefault();
          togglePalette();
        } else if (def.group === 'navigation' && def.path !== undefined) {
          // Yalnızca aktif yedek route'unda (:udid) çalışır.
          if (udid === undefined) return;
          e.preventDefault();
          navigate(def.path ? `/backup/${udid}/${def.path}` : `/backup/${udid}`);
        }
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, udid, toggleSidebar, togglePalette]);

  return { helpOpen, setHelpOpen };
}
