import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ipcMain, dialog, BrowserWindow, shell, session } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  ExportSaveRequest,
  ExportSaveResult,
  ExportCopyMediaRequest,
  ExportCopyMediaResult,
  ExportCopyMediaBatchRequest,
  ExportCopyMediaBatchResult,
  ExportNotesFolderRequest,
  ExportNotesFolderResult,
  MessageThreadExportPayload,
  WaThreadExportPayload,
  ShowInFolderRequest,
  ShowInFolderResult,
} from '@shared/ipc';
import type { Contact, Note, CallRecord, Voicemail, VoiceMemo } from '@shared/domain';
import {
  exportMessageThread,
  exportWaThread,
  exportContacts,
  exportNote,
  exportCallLog,
  exportVoicemails,
  exportVoiceMemos,
  extForFormat,
  kindSupportsPdf,
  type MessageExportFormat,
  type WaExportFormat,
  type ContactsExportFormat,
  type NoteExportFormat,
  type CallLogExportFormat,
  type AudioListExportFormat,
} from '@main/modules/export/exportService';
import {
  sanitizeName,
  uniqueFileName,
  validateBatchItems,
  isBatchItem,
} from '@main/modules/export/exportNames';
import { loadFullMessageThread, loadFullWaThread } from '@main/modules/export/threadLoader';
import {
  EXPORT_CSP,
  PDF_PARTITION,
  PDF_SCHEME,
  PDF_TIMEOUT_MS,
  pdfDocUrl,
  pdfDocIdFromUrl,
  pdfWebPreferences,
  isAllowedPdfRequest,
  withTimeout,
} from '@main/modules/export/pdfPolicy';
import { listNotes } from '@main/modules/notes/listNotes';
import { fileIdToBackupPath } from '@main/modules/manifest/fileId';
import { resolveBackupFile } from '@main/modules/backup/resolveBackupFile';
import { copyFileOut, writeFileOut, existsSync } from '@main/safeFs';
import { guardBackupRef, assertFileId } from '@main/ipc/guard';
import { logger } from '@main/util/log';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Liste payload'ı dizi mi — değilse anlaşılır hata (renderer yanlış kullanımı). */
function asArray<T>(payload: unknown, kind: string): T[] {
  if (!Array.isArray(payload)) throw new Error(`export: ${kind} payload bir dizi olmalı`);
  return payload as T[];
}

async function serialize(req: ExportSaveRequest): Promise<string> {
  switch (req.kind) {
    case 'messageThread': {
      // Tam sohbet main'de okunur — renderer yalnız yüklenmiş sayfaları tutar.
      const p = req.payload as MessageThreadExportPayload;
      guardBackupRef(p);
      if (!Number.isInteger(p.chatId)) throw new Error('export: geçersiz chatId');
      const messages = await loadFullMessageThread({
        udid: p.udid,
        rootPath: p.rootPath,
        chatId: p.chatId,
      });
      return exportMessageThread(p.conversation, messages, req.format as MessageExportFormat);
    }
    case 'waThread': {
      const p = req.payload as WaThreadExportPayload;
      guardBackupRef(p);
      if (!Number.isInteger(p.sessionId)) throw new Error('export: geçersiz sessionId');
      const messages = await loadFullWaThread({
        udid: p.udid,
        rootPath: p.rootPath,
        sessionId: p.sessionId,
      });
      return exportWaThread(p.conversation, messages, req.format as WaExportFormat);
    }
    case 'contacts':
      return exportContacts(
        asArray<Contact>(req.payload, req.kind),
        req.format as ContactsExportFormat,
      );
    case 'note':
      return exportNote(req.payload as Note, req.format as NoteExportFormat);
    case 'callLog':
      return exportCallLog(
        asArray<CallRecord>(req.payload, req.kind),
        req.format as CallLogExportFormat,
      );
    case 'voicemails':
      return exportVoicemails(
        asArray<Voicemail>(req.payload, req.kind),
        req.format as AudioListExportFormat,
      );
    case 'voiceMemos':
      return exportVoiceMemos(
        asArray<VoiceMemo>(req.payload, req.kind),
        req.format as AudioListExportFormat,
      );
    default:
      throw new Error(`export: bilinmeyen kind: ${(req as ExportSaveRequest).kind}`);
  }
}

// ─── PDF render penceresi ────────────────────────────────────────────────────
// Güvenilmez içerik (yedekteki metin) → JS kapalı, sandbox, izole bellek-içi
// session, ağ isteği iptal, navigasyon/pencere açma yok, süre sınırı, pencere
// her yolda destroy. Politika sabitleri modules/export/pdfPolicy.ts'te (test edilir).

/** afv-pdf://doc/<id> → bekleyen HTML (yalnız render süresince tutulur). */
const pendingPdfHtml = new Map<string, string>();
let pdfSessionReady = false;

function preparePdfSession(): void {
  if (pdfSessionReady) return;
  const ses = session.fromPartition(PDF_PARTITION);
  ses.protocol.handle(PDF_SCHEME, (request) => {
    const id = pdfDocIdFromUrl(request.url);
    const html = id ? pendingPdfHtml.get(id) : undefined;
    if (html == null) return new Response('Not found', { status: 404 });
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': EXPORT_CSP,
      },
    });
  });
  // Ağ yasağı: belge + data: dışındaki her istek (http/file/ws/backup://…) iptal.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const allowed = isAllowedPdfRequest(details.url);
    if (!allowed) logger.warn(`[export] pdf request blocked: ${details.url.slice(0, 120)}`);
    cb({ cancel: !allowed });
  });
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  pdfSessionReady = true;
}

/** HTML string → PDF buffer (gizli, kilitli pencere). */
async function htmlToPdf(html: string): Promise<Buffer> {
  preparePdfSession();
  const id = randomUUID();
  pendingPdfHtml.set(id, html);
  let win: BrowserWindow | null = null;
  try {
    win = new BrowserWindow({ show: false, webPreferences: pdfWebPreferences() });
    const wc = win.webContents;
    // Belge içinden hiçbir yere gidilemez / yeni pencere açılamaz.
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.on('will-redirect', (e) => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    const w = win;
    return await withTimeout(
      (async () => {
        await w.loadURL(pdfDocUrl(id));
        return w.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 },
        });
      })(),
      PDF_TIMEOUT_MS,
      'PDF oluşturma',
    );
  } finally {
    pendingPdfHtml.delete(id);
    if (win && !win.isDestroyed()) win.destroy();
  }
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

async function pickFolder(title: string): Promise<string | null> {
  const win = focusedWindow();
  const opts: Electron.OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
    title,
  };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (picked.canceled || picked.filePaths.length === 0) return null;
  return path.resolve(picked.filePaths[0]!);
}

async function handleSave(req: ExportSaveRequest): Promise<ExportSaveResult> {
  try {
    const isPdf = req.format === 'pdf';
    if (isPdf && !kindSupportsPdf(req.kind)) {
      return { saved: false, error: `PDF bu içerik türü için desteklenmiyor: ${req.kind}` };
    }
    const ext = extForFormat(req.format);
    const defaultName = `${sanitizeName(req.suggestedName)}.${ext}`;
    const win = focusedWindow();
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: defaultName })
      : await dialog.showSaveDialog({ defaultPath: defaultName });

    if (result.canceled || !result.filePath) {
      return { saved: false, canceled: true };
    }
    // Serileştirme dialog'dan SONRA: tam sohbet okuması iptal edilen export'ta boşa gitmesin.
    // PDF = HTML serileştirmesi + printToPDF (ayrı bir şablon yok).
    const content = await serialize(isPdf ? { ...req, format: 'html' } : req);
    const data = isPdf ? await htmlToPdf(content) : content;
    const dest = path.resolve(result.filePath);
    // writeFileOut korunan yedek köklerine yazmayı reddeder (dialog'da yedek içi seçilse bile).
    await writeFileOut(dest, data);
    logger.info(`[export] saved kind=${req.kind} format=${req.format} → ${dest}`);
    return { saved: true, path: dest };
  } catch (err) {
    const message = errMessage(err);
    logger.error(`[export] save failed: ${message}`);
    return { saved: false, error: message };
  }
}

async function handleCopyMedia(req: ExportCopyMediaRequest): Promise<ExportCopyMediaResult> {
  try {
    guardBackupRef(req);
    assertFileId(req.fileId);
    const defaultName = sanitizeName(req.suggestedName, req.fileId);
    const win = focusedWindow();
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: defaultName })
      : await dialog.showSaveDialog({ defaultPath: defaultName });

    if (result.canceled || !result.filePath) {
      return { saved: false, canceled: true };
    }
    // BUG 2 — dialog'un verdiği path relative olabilir → cwd'ye yazardı. Absolute'a sabitle.
    const dest = path.resolve(result.filePath);
    // backupRoot = rootPath/udid (rootPath MobileSync/Backup üst klasörü; udid alt klasör).
    // Şifreli (kilidi açık) yedekte kaynak oturum dizinindeki çözülmüş dosyadır — büyük
    // videoda çözüm sürebilir, bu yüzden dialog'dan SONRA (iptalde boşa çözüm yok).
    const src = await resolveBackupFile(req.udid, path.join(req.rootPath, req.udid), req.fileId);
    if (!src) return { saved: false, error: `Yedekte dosya yok: ${req.fileId}` };
    // copyFileOut backup kökü altına yazmayı reddeder; hedef kullanıcı dialog'undan.
    await copyFileOut(src, dest);
    // BUG 2 — copyFileOut throw etmese de dosya gerçekten yazıldı mı doğrula. ENOENT
    // gitti ama "aktarıldı" diyip dosya yoksa → sessiz başarısızlık. existsSync ile yakala.
    const destExists = existsSync(dest);
    logger.info(`[export] copyMedia src=${src} dest=${dest} destExists=${destExists}`);
    if (!destExists) {
      logger.error(`[export] media copy reported success but dest missing: ${dest}`);
      return { saved: false, error: `Dosya hedefe yazılamadı: ${dest}` };
    }
    logger.info(`[export] media copied fileId=${req.fileId} → ${dest}`);
    return { saved: true, path: dest };
  } catch (err) {
    const message = errMessage(err);
    logger.error(`[export] media copy failed: ${message}`);
    return { saved: false, error: message };
  }
}

async function handleCopyMediaBatch(
  req: ExportCopyMediaBatchRequest,
): Promise<ExportCopyMediaBatchResult> {
  // Doğrulama hataları da sonuç şekliyle döner (throw → renderer'da ham IPC hatası olurdu).
  let backupRoot: string;
  try {
    guardBackupRef(req);
    const invalid = validateBatchItems((req as { items?: unknown }).items);
    if (invalid) throw new Error(invalid);
    backupRoot = path.join(req.rootPath, req.udid);
  } catch (err) {
    const message = errMessage(err);
    logger.error(`[export] copyMediaBatch rejected: ${message}`);
    return { copied: 0, failed: 0, errors: [message] };
  }

  let dir: string | null;
  try {
    dir = await pickFolder('Dışa aktarma klasörünü seç');
  } catch (err) {
    return { copied: 0, failed: 0, errors: [errMessage(err)] };
  }
  if (!dir) return { canceled: true, copied: 0, failed: 0, errors: [] };

  let copied = 0;
  let failed = 0;
  const errors: string[] = [];
  const seen = new Set<string>();
  const target = dir;

  for (const item of req.items as unknown[]) {
    try {
      if (!isBatchItem(item)) throw new Error('Geçersiz öğe');
      assertFileId(item.fileId);
      const src = await resolveBackupFile(req.udid, backupRoot, item.fileId);
      if (!src) throw new Error(`Yedekte dosya yok: ${item.fileId}`);
      // Ad çakışması: aynı adda ikinci dosyaya " (2)" eki — sessiz üzerine yazma yok.
      const name = uniqueFileName(sanitizeName(item.suggestedName, item.fileId), seen, (n) =>
        existsSync(path.join(target, n)),
      );
      await copyFileOut(src, path.join(target, name));
      copied += 1;
    } catch (err) {
      failed += 1;
      if (errors.length < 5) errors.push(errMessage(err));
    }
  }
  logger.info(`[export] copyMediaBatch dir=${target} copied=${copied} failed=${failed}`);
  return { dir: target, copied, failed, errors };
}

/** Tüm notlar → seçilen klasöre not başına bir TXT (notlar main'de okunur). */
async function handleNotesFolder(req: ExportNotesFolderRequest): Promise<ExportNotesFolderResult> {
  let notes: Note[];
  try {
    guardBackupRef(req);
    notes = await listNotes({ udid: req.udid, rootPath: req.rootPath });
  } catch (err) {
    const message = errMessage(err);
    logger.error(`[export] notesFolder rejected: ${message}`);
    return { copied: 0, failed: 0, errors: [message] };
  }
  if (notes.length === 0) return { copied: 0, failed: 0, errors: ['Dışa aktarılacak not yok'] };

  let dir: string | null;
  try {
    dir = await pickFolder('Notlar için klasör seç');
  } catch (err) {
    return { copied: 0, failed: 0, errors: [errMessage(err)] };
  }
  if (!dir) return { canceled: true, copied: 0, failed: 0, errors: [] };

  let copied = 0;
  let failed = 0;
  const errors: string[] = [];
  const seen = new Set<string>();
  const target = dir;
  for (const note of notes) {
    try {
      const base = sanitizeName(note.title, `note-${note.id}`);
      const name = uniqueFileName(`${base}.txt`, seen, (n) => existsSync(path.join(target, n)));
      await writeFileOut(path.join(target, name), exportNote(note, 'txt'));
      copied += 1;
    } catch (err) {
      failed += 1;
      if (errors.length < 5) errors.push(errMessage(err));
    }
  }
  logger.info(`[export] notesFolder dir=${target} written=${copied} failed=${failed}`);
  return { dir: target, copied, failed, errors };
}

async function handleShowInFolder(req: ShowInFolderRequest): Promise<ShowInFolderResult> {
  try {
    guardBackupRef(req);
    assertFileId(req.fileId);
    // Gerçek hash'li dosyayı Explorer'da seç. relativePath (Media/DCIM/...) iOS backup-içi
    // yoldur, Windows'ta açılmaz — kullanıcı gerçek dosyayı görmek ister.
    // Bilinçli olarak resolveBackupFile'dan GEÇMEZ: içerik okunmaz, yalnız yedekteki konum
    // gösterilir (şifreli yedekte de şifreli blob'un yeri — geçici düz metin kopyası
    // kullanıcıya işaret edilmez, kilitte silinecektir).
    const abs = fileIdToBackupPath(path.join(req.rootPath, req.udid), req.fileId);
    shell.showItemInFolder(abs);
    return { shown: true };
  } catch (err) {
    const message = errMessage(err);
    logger.error(`[file] showInFolder failed: ${message}`);
    return { shown: false, error: message };
  }
}

export function registerExportIpc(): void {
  ipcMain.handle(IPC.EXPORT_SAVE, (_e, req: ExportSaveRequest) => handleSave(req));
  ipcMain.handle(IPC.EXPORT_COPY_MEDIA, (_e, req: ExportCopyMediaRequest) => handleCopyMedia(req));
  ipcMain.handle(IPC.EXPORT_COPY_MEDIA_BATCH, (_e, req: ExportCopyMediaBatchRequest) =>
    handleCopyMediaBatch(req),
  );
  ipcMain.handle(IPC.EXPORT_NOTES_FOLDER, (_e, req: ExportNotesFolderRequest) =>
    handleNotesFolder(req),
  );
  ipcMain.handle(IPC.FILE_SHOW_IN_FOLDER, (_e, req: ShowInFolderRequest) =>
    handleShowInFolder(req),
  );
}
