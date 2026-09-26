// EncryptedDialog — şifreli yedeğin kilit açma formu.
// Parola yalnız bileşen state'inde yaşar, backup:unlock çağrısıyla main'e geçer ve
// başarıda hemen temizlenir; hiçbir yere (store, localStorage, log) yazılmaz.
// PBKDF2 gerçek yedeklerde saniyeler sürer → meşgul durumu (spinner, aria-busy,
// girişler kilitli, dialog kapatılamaz).
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { L } from '../i18n';

export interface UnlockTarget {
  udid: string;
  rootPath: string;
  deviceName: string | null;
}

interface Props {
  /** Kilidi açılacak yedek; null → dialog kapalı. */
  backup: UnlockTarget | null;
  onClose: () => void;
  /** Kilit açıldıktan sonra (yedeği açma / yönlendirme çağıranın işi). */
  onUnlocked: (backup: UnlockTarget) => void | Promise<void>;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'wrong' }
  | { kind: 'error'; detail: string };

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function UnlockForm({
  backup,
  onClose,
  onUnlocked,
  onBusyChange,
}: {
  backup: UnlockTarget;
  onClose: () => void;
  onUnlocked: Props['onUnlocked'];
  onBusyChange: (busy: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const inputId = `${ids}-pw`;
  const errorId = `${ids}-err`;
  const capsId = `${ids}-caps`;
  const noteId = `${ids}-note`;
  const busy = status.kind === 'busy';

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Hata sonrası alan yeniden etkin → odakla + seç (yeniden yazmak için).
  useEffect(() => {
    if (status.kind === 'wrong' || status.kind === 'error') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [status]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || password.length === 0) return;
    setStatus({ kind: 'busy' });
    try {
      const res = await window.api.backup.unlock({
        udid: backup.udid,
        rootPath: backup.rootPath,
        password,
      });
      if (res.status === 'ok') {
        setPassword('');
        setStatus({ kind: 'idle' });
        await onUnlocked(backup);
        return;
      }
      if (res.status === 'wrongPassword') setStatus({ kind: 'wrong' });
      else setStatus({ kind: 'error', detail: res.message });
    } catch (err) {
      setStatus({ kind: 'error', detail: errText(err) });
    }
  };

  const describedBy = [
    noteId,
    capsLock ? capsId : null,
    status.kind === 'wrong' || status.kind === 'error' ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <form onSubmit={submit} aria-busy={busy || undefined} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" strokeWidth={1.5} aria-hidden="true" />
          {L.unlock.title}
        </DialogTitle>
        <DialogDescription>
          {L.unlock.body}
          {backup.deviceName && (
            <span className="mt-1 block font-medium text-text">{backup.deviceName}</span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {L.unlock.passwordLabel}
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id={inputId}
            type={reveal ? 'text' : 'password'}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={password}
            disabled={busy}
            onChange={(e) => {
              setPassword(e.target.value);
              if (status.kind === 'wrong' || status.kind === 'error') setStatus({ kind: 'idle' });
            }}
            onKeyDown={onKey}
            onKeyUp={onKey}
            aria-invalid={status.kind === 'wrong' || undefined}
            aria-describedby={describedBy}
            className="h-9 w-full rounded-md border border-border bg-bg px-3 pr-10 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 aria-[invalid=true]:border-danger"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            disabled={busy}
            aria-label={reveal ? L.unlock.hidePassword : L.unlock.showPassword}
            aria-pressed={reveal}
            title={reveal ? L.unlock.hidePassword : L.unlock.showPassword}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-text-muted transition-colors duration-fast hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {reveal ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        </div>
        {capsLock && (
          <p id={capsId} className="text-xs font-medium text-warning">
            {L.unlock.capsLock}
          </p>
        )}
        {status.kind === 'wrong' && (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {L.unlock.wrongPassword}
          </p>
        )}
        {status.kind === 'error' && (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {L.unlock.errorPrefix} <span className="break-words">{status.detail}</span>
          </p>
        )}
      </div>

      <p id={noteId} className="text-xs text-text-muted">
        {L.unlock.privacyNote}
      </p>

      {busy && (
        <div role="status" className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
          <span>{L.unlock.busy}</span>
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {L.unlock.cancel}
        </Button>
        <Button type="submit" disabled={busy || password.length === 0}>
          {busy && <Loader2 className="animate-spin" strokeWidth={1.5} aria-hidden="true" />}
          {L.unlock.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EncryptedDialog({ backup, onClose, onUnlocked }: Props) {
  const [busy, setBusy] = useState(false);
  const guardedClose = () => {
    if (!busy) onClose();
  };
  return (
    <Dialog open={backup !== null} onOpenChange={(o) => !o && guardedClose()}>
      <DialogContent
        // Kilit açma sürerken Esc / dış tıklama dialog'u kapatmaz (iş arka planda sürerdi).
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
      >
        {backup && (
          // key: başka bir yedeğe geçişte form state'i (parola dahil) sıfırlanır
          <UnlockForm
            key={`${backup.rootPath}|${backup.udid}`}
            backup={backup}
            onClose={guardedClose}
            onUnlocked={onUnlocked}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
