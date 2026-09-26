import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { Note, WaConversation } from '@shared/domain';
import { AppToaster } from '@renderer/components/ui/toast';
import { runExportSave, runFolderExport } from '@renderer/components/ExportMenu';
import { WaThread } from '@renderer/routes/whatsapp/WaThread';
import { NoteDetail } from '@renderer/routes/notes/NoteDetail';
import { L } from '@renderer/i18n';

const conversation: WaConversation = {
  sessionId: 1,
  displayName: 'Ahmet',
  contactJid: '905@s.whatsapp.net',
  contactName: null,
  isGroup: false,
  lastMessagePreview: '',
  lastMessageDateIso: null,
  messageCount: 0,
};

function waThreadProps(overrides: Partial<Parameters<typeof WaThread>[0]> = {}) {
  return {
    conversation,
    messages: [],
    loading: false,
    error: null,
    onRetry: vi.fn(),
    udid: 'a'.repeat(40),
    onExport: vi.fn(),
    hasOlder: false,
    loadingOlder: false,
    onLoadOlder: vi.fn(),
    ...overrides,
  };
}

const save = vi.fn();
const copyMediaBatch = vi.fn();

beforeEach(() => {
  save.mockReset();
  copyMediaBatch.mockReset();
  Object.defineProperty(window, 'api', {
    writable: true,
    value: { export: { save, copyMediaBatch } },
  });
});

describe('WaThread', () => {
  it('yükleme hatası "boş sohbet" DEĞİL — RouteError + yeniden dene', () => {
    const props = waThreadProps({ error: new Error('db kilitli') });
    render(<WaThread {...props} />);
    expect(screen.queryByText(L.whatsapp.emptyThreadTitle)).not.toBeInTheDocument();
    expect(screen.getByText(L.whatsapp.threadErrorTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: L.common.retry }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('hata yoksa ve mesaj yoksa boş sohbet metni', () => {
    render(<WaThread {...waThreadProps()} />);
    expect(screen.getByText(L.whatsapp.emptyThreadTitle)).toBeInTheDocument();
  });

  it('sohbet içi arama: input ve kapat butonu kendi aria etiketleriyle', () => {
    render(<WaThread {...waThreadProps()} />);
    const toggle = screen.getByRole('button', { name: L.whatsapp.searchAria });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: L.whatsapp.threadSearchInputAria })).toBeVisible();
    const close = screen.getByRole('button', { name: L.whatsapp.closeSearchAria });
    expect(L.whatsapp.closeSearchAria).not.toBe(L.lightbox.closeAria);
    fireEvent.click(close);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('eski sayfa yüklenirken gösterge', () => {
    render(<WaThread {...waThreadProps({ loadingOlder: true })} />);
    expect(screen.getByText(L.whatsapp.loadingOlder)).toBeInTheDocument();
  });
});

describe('NoteDetail export', () => {
  const note: Note = {
    id: 7,
    title: 'Alışveriş',
    snippet: '',
    body: 'süt',
    runs: [],
    createdIso: null,
    modifiedIso: null,
    folderName: 'Ev',
  };

  it('export menüsü noteAria ile; TXT seçimi note kind ile kaydeder', async () => {
    save.mockResolvedValue({ saved: true, path: 'C:/x/Alışveriş.txt' });
    render(<NoteDetail note={note} />);
    fireEvent.click(screen.getByRole('button', { name: L.export.noteAria }));
    fireEvent.click(screen.getByRole('menuitem', { name: L.exportMenu.asTxt }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toMatchObject({
      kind: 'note',
      format: 'txt',
      payload: note,
      suggestedName: 'Alışveriş',
    });
  });

  it('klasör adı erişilebilir etiketle', () => {
    render(<NoteDetail note={note} />);
    expect(screen.getByTitle(L.notes.folderLabel)).toHaveTextContent('Ev');
  });
});

describe('export geri bildirimi', () => {
  it('runExportSave: kaydedildi → başarı bildirimi (yol ile)', async () => {
    save.mockResolvedValue({ saved: true, path: 'C:/out/a.csv' });
    render(<AppToaster />);
    await act(async () => {
      await runExportSave({ kind: 'callLog', format: 'csv', payload: [], suggestedName: 'x' });
    });
    expect(await screen.findByText(`${L.export.saved}: C:/out/a.csv`)).toBeInTheDocument();
  });

  it('runExportSave: hata → hata bildirimi; iptal → sessiz', async () => {
    save.mockResolvedValueOnce({ saved: false, error: 'disk dolu' });
    save.mockResolvedValueOnce({ saved: false, canceled: true });
    render(<AppToaster />);
    await act(async () => {
      await runExportSave({ kind: 'callLog', format: 'pdf', payload: [], suggestedName: 'x' });
      await runExportSave({ kind: 'callLog', format: 'pdf', payload: [], suggestedName: 'x' });
    });
    expect(await screen.findByText(`${L.export.error}: disk dolu`)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(L.export.saved))).not.toBeInTheDocument();
  });

  it('runFolderExport: tam başarı / kısmi / hiç yazılamadı', async () => {
    render(<AppToaster />);
    await act(async () => {
      await runFolderExport(async () => ({ dir: 'D:/out', copied: 3, failed: 0, errors: [] }));
    });
    expect(
      await screen.findByText(`3 ${L.export.filesExportedSuffix} → D:/out`),
    ).toBeInTheDocument();

    await act(async () => {
      await runFolderExport(async () => ({
        dir: 'D:/o',
        copied: 1,
        failed: 2,
        errors: ['ENOENT'],
      }));
    });
    expect(
      await screen.findByText(
        `1 ${L.export.filesExportedSuffix}, 2 ${L.export.filesFailedSuffix} — ENOENT`,
      ),
    ).toBeInTheDocument();

    await act(async () => {
      await runFolderExport(async () => ({
        copied: 0,
        failed: 0,
        errors: ['items bir dizi olmalı'],
      }));
    });
    expect(
      await screen.findByText(`${L.export.error} — items bir dizi olmalı`),
    ).toBeInTheDocument();
  });

  it('runFolderExport: iptal → bildirim yok', async () => {
    render(<AppToaster />);
    const run = vi.fn(async () => ({ canceled: true, copied: 0, failed: 0, errors: [] }));
    await act(async () => {
      await runFolderExport(run);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(new RegExp(L.export.filesExportedSuffix))).not.toBeInTheDocument();
  });
});
