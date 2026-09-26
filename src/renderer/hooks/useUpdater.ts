// useUpdater — main'deki güncelleme servisinin anlık görüntüsüne abone olur
// (UPDATE_PUSH) ve kullanıcı eylemlerini IPC'ye iletir. Preload köprüsü yoksa
// (test / bozuk ortam) snapshot null kalır ve eylemler no-op'tur.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateOpenTarget, UpdateSnapshot } from '@shared/ipc';
import { notify } from '../components/ui/toast';
import { L } from '../i18n';

export function useUpdater() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
  // İlk get() yanıtı, arada gelmiş daha yeni bir push'u ezmesin.
  const pushed = useRef(false);

  useEffect(() => {
    const api = window.api?.updater;
    if (!api) return;
    let alive = true;
    const off = api.onPush((s) => {
      pushed.current = true;
      if (alive) setSnapshot(s);
    });
    api
      .get()
      .then((s) => {
        if (alive && !pushed.current) setSnapshot(s);
      })
      .catch((e: unknown) => console.warn('[useUpdater] get failed', e));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const run = useCallback(
    async (fn: () => Promise<UpdateSnapshot | boolean | void>): Promise<void> => {
      try {
        const res = await fn();
        if (res && typeof res === 'object') setSnapshot(res);
      } catch (e) {
        console.warn('[useUpdater] action failed', e);
        notify.error(L.update.actionError);
      }
    },
    [],
  );

  const api = typeof window !== 'undefined' ? window.api?.updater : undefined;

  const check = useCallback(() => (api ? run(() => api.check()) : Promise.resolve()), [api, run]);
  const download = useCallback(
    () => (api ? run(() => api.download()) : Promise.resolve()),
    [api, run],
  );
  const install = useCallback(
    () => (api ? run(() => api.install()) : Promise.resolve()),
    [api, run],
  );
  const setAutoCheck = useCallback(
    (value: boolean) => (api ? run(() => api.setAutoCheck(value)) : Promise.resolve()),
    [api, run],
  );
  const openExternal = useCallback(
    (target: UpdateOpenTarget) => (api ? run(() => api.openExternal(target)) : Promise.resolve()),
    [api, run],
  );

  return { snapshot, check, download, install, setAutoCheck, openExternal };
}
