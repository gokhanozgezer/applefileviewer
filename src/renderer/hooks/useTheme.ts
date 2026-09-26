import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import type { ThemeMode } from '@shared/ipc';

export function useTheme() {
  const { themeMode, resolvedTheme, setTheme } = useUIStore();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      // Defensive: preload bridge yoksa system theme fallback
      if (!window.api?.theme) {
        console.warn(
          '[useTheme] window.api.theme not available — preload bridge missing. Falling back to prefers-color-scheme.',
        );
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = (resolved: 'light' | 'dark') => {
          setTheme('system', resolved);
          document.documentElement.setAttribute('data-theme', resolved);
          try {
            localStorage.setItem('afv:resolvedTheme', resolved);
          } catch {
            /* ignore */
          }
        };
        apply(mql.matches ? 'dark' : 'light');
        const onChange = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
        mql.addEventListener('change', onChange);
        unsubscribe = () => mql.removeEventListener('change', onChange);
        return;
      }

      // Normal path: IPC bridge mevcut
      const initial = await window.api.theme.get();
      setTheme(initial.mode, initial.resolved);
      document.documentElement.setAttribute('data-theme', initial.resolved);
      try {
        localStorage.setItem('afv:resolvedTheme', initial.resolved);
      } catch {
        /* ignore */
      }

      unsubscribe = window.api.theme.onPush((p) => {
        setTheme(p.mode, p.resolved);
        document.documentElement.setAttribute('data-theme', p.resolved);
        try {
          localStorage.setItem('afv:resolvedTheme', p.resolved);
        } catch {
          /* ignore */
        }
      });
    })();

    return () => unsubscribe?.();
  }, [setTheme]);

  /** Belirli bir moda doğrudan geç (Settings segmented control). */
  const setMode = async (mode: ThemeMode) => {
    if (!window.api?.theme) {
      console.warn('[useTheme] setMode no-op — preload bridge missing');
      return;
    }
    const result = await window.api.theme.set(mode);
    setTheme(result.mode, result.resolved);
    document.documentElement.setAttribute('data-theme', result.resolved);
  };

  const cycle = async () => {
    const next: ThemeMode =
      themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
    await setMode(next);
  };

  return { themeMode, resolvedTheme, cycle, setMode };
}
