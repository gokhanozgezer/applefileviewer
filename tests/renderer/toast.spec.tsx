import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppToaster, notify, copyToClipboard } from '@renderer/components/ui/toast';
import { L } from '@renderer/i18n';

function setClipboard(writeText: ((t: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

afterEach(() => setClipboard(undefined));

describe('toast sistemi', () => {
  it('AppToaster erişilebilir bildirim bölgesi render eder ve notify mesajını gösterir', async () => {
    render(<AppToaster />);
    expect(screen.getByLabelText(new RegExp(L.common.notificationsAria))).toBeInTheDocument();
    act(() => {
      notify.success('Kaydedildi');
    });
    expect(await screen.findByText('Kaydedildi')).toBeInTheDocument();
  });

  it('copyToClipboard başarıda metni yazar ve başarı bildirir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<AppToaster />);
    let ok = false;
    await act(async () => {
      ok = await copyToClipboard('ABC-123');
    });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('ABC-123');
    expect(await screen.findByText(L.common.copied)).toBeInTheDocument();
  });

  it('copyToClipboard hatayı yutmaz — hata bildirimi gösterir', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<AppToaster />);
    let ok = true;
    await act(async () => {
      ok = await copyToClipboard('x');
    });
    expect(ok).toBe(false);
    expect(await screen.findByText(L.common.copyError)).toBeInTheDocument();
  });
});
