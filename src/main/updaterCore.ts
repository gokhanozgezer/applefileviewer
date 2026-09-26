// updaterCore — güncelleme servisinin Electron'suz (birim test edilebilir) çekirdeği.
//
// Uygulama HİÇBİR platformda imzalı değil; bu yüzden yetenek matrisi:
//   win-nsis        → auto   (electron-updater: indir + kur; yayıncı imza doğrulaması atlanır)
//   linux-appimage  → auto   (electron-updater AppImageUpdater)
//   win-portable    → notify (portable exe kendini güncelleyemez)
//   linux-deb       → notify (paket yöneticisi / elle kurulum)
//   mac             → notify (Squirrel.Mac imza ister — indirme/kurulum ASLA denenmez)
//   dev / paketlenmemiş → disabled (UI yine "releases sayfasını aç" sunar)
//
// 'auto' modda durum makinesini electron-updater olayları sürer; 'notify' modda GitHub
// REST API'den (releases/latest) okunur ve kullanıcı tarayıcıya yönlendirilir.
// Kurulum (quitAndInstall) YALNIZ kullanıcı eylemiyle ve önce beforeInstall (şifreli
// oturum silme vb.) tamamlandıktan sonra çağrılır.

import type {
  UpdateCheckOrigin,
  UpdateKind,
  UpdateMode,
  UpdateOpenTarget,
  UpdateSnapshot,
  UpdateState,
} from '@shared/ipc';
import { isGitHubUrl } from './windowPolicy';

/** Sessiz kontroller arası asgari süre. */
export const SILENT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Açılıştan sonra sessiz kontrol gecikmesi — açılışı yavaşlatmasın. */
export const STARTUP_CHECK_DELAY_MS = 10_000;
const MAX_NOTES_LENGTH = 20_000;
const MAX_ERROR_LENGTH = 300;

// ── Yetenek matrisi ──────────────────────────────────────────────────────────

export interface PlatformInfo {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
}

export function detectUpdateKind({ isPackaged, platform, env }: PlatformInfo): UpdateKind {
  if (!isPackaged) return 'dev';
  if (platform === 'win32') return env.PORTABLE_EXECUTABLE_DIR ? 'win-portable' : 'win-nsis';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux') return env.APPIMAGE ? 'linux-appimage' : 'linux-deb';
  return 'unsupported';
}

export function modeForKind(kind: UpdateKind): UpdateMode {
  switch (kind) {
    case 'win-nsis':
    case 'linux-appimage':
      return 'auto';
    case 'win-portable':
    case 'linux-deb':
    case 'mac':
      return 'notify';
    default:
      return 'disabled';
  }
}

// ── Depo koordinatları (package.json repository → derleme zamanı define) ─────

export interface RepoRef {
  owner: string;
  repo: string;
}

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * package.json `repository` biçimlerini çözer: "owner/repo", "github:owner/repo",
 * "https://github.com/owner/repo(.git)", "git+https://…", "git@github.com:owner/repo.git".
 * GitHub dışı / bozuk → null.
 */
export function parseGitHubRepo(raw: unknown): RepoRef | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^github:/, '');
  s = s.replace(/^git\+/, '');
  s = s.replace(/^git@github\.com:/, 'https://github.com/');
  s = s.replace(/^(ssh|git):\/\/(git@)?github\.com\//, 'https://github.com/');
  let path: string;
  if (/^[a-z]+:\/\//i.test(s)) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return null;
    }
    if (u.hostname !== 'github.com') return null;
    path = u.pathname;
  } else {
    path = s;
  }
  const parts = path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/, '')
    .split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts as [string, string];
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || owner.startsWith('.') || repo === '..') {
    return null;
  }
  return { owner, repo };
}

export function releasesUrlFor(repo: RepoRef | null): string | null {
  return repo ? `https://github.com/${repo.owner}/${repo.repo}/releases` : null;
}

// ── Sürüm karşılaştırma (semver alt kümesi) ──────────────────────────────────

function parseVersion(v: string): { nums: number[]; pre: string | null } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/** a > b → 1, a < b → -1, eşit / çözülemez → 0. Pre-release, aynı sürümün finalinden küçüktür. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre > pb.pre ? 1 : pa.pre < pb.pre ? -1 : 0;
}

// ── Sürüm notları → düz metin ────────────────────────────────────────────────
// Uzak HTML ASLA render edilmez: etiketler ayıklanır, temel entity'ler çözülür,
// renderer düz metin olarak (whitespace-pre-wrap) gösterir.

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

export function htmlToPlainText(html: string): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|pre|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      const lower = name.toLowerCase();
      if (lower in ENTITIES) return ENTITIES[lower] ?? whole;
      if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16), whole);
      if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10), whole);
      return whole;
    });
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeCodePoint(cp: number, fallback: string): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return fallback;
  return String.fromCodePoint(cp);
}

/** electron-updater releaseNotes (string | {version, note}[]) veya GitHub body → düz metin. */
export function releaseNotesToText(notes: unknown): string | null {
  let raw: string;
  if (typeof notes === 'string') raw = notes;
  else if (Array.isArray(notes)) {
    raw = notes
      .map((n: unknown) => {
        if (!n || typeof n !== 'object') return '';
        const { version, note } = n as { version?: unknown; note?: unknown };
        const head = typeof version === 'string' ? `${version}\n` : '';
        return head + (typeof note === 'string' ? note : '');
      })
      .filter(Boolean)
      .join('\n\n');
  } else return null;
  const text = htmlToPlainText(raw);
  if (!text) return null;
  return text.length > MAX_NOTES_LENGTH ? `${text.slice(0, MAX_NOTES_LENGTH)}…` : text;
}

// ── GitHub release (notify modu) ─────────────────────────────────────────────

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

/** API yanıtını doğrular (güvenilmeyen JSON) — beklenen şekil değilse null. */
export function parseGitHubRelease(json: unknown): GitHubRelease | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') return null;
  const assets = Array.isArray(r.assets)
    ? r.assets.flatMap((a: unknown) => {
        if (!a || typeof a !== 'object') return [];
        const { name, browser_download_url } = a as Record<string, unknown>;
        return typeof name === 'string' && typeof browser_download_url === 'string'
          ? [{ name, browser_download_url }]
          : [];
      })
    : [];
  return {
    tag_name: r.tag_name,
    html_url: r.html_url,
    body: typeof r.body === 'string' ? r.body : null,
    published_at: typeof r.published_at === 'string' ? r.published_at : null,
    draft: r.draft === true,
    prerelease: r.prerelease === true,
    assets,
  };
}

const ARCH_ALIASES: Record<string, string[]> = {
  x64: ['x64', 'x86_64', 'amd64'],
  arm64: ['arm64', 'aarch64'],
  ia32: ['ia32', 'i386', 'x86'],
};

/**
 * Platforma uygun doğrudan indirme bağlantısı: mac → .dmg, deb → .deb, portable → .exe
 * (adında "portable"). Mimariye uyan tercih edilir, yoksa mimarisiz (universal) olan.
 * Yalnız https://github.com bağlantıları döner.
 */
export function pickDownloadAsset(
  kind: UpdateKind,
  arch: string,
  assets: readonly GitHubAsset[],
): string | null {
  const ext =
    kind === 'mac'
      ? '.dmg'
      : kind === 'linux-deb'
        ? '.deb'
        : kind === 'win-portable'
          ? '.exe'
          : null;
  if (!ext) return null;
  const candidates = assets.filter((a) => {
    const n = a.name.toLowerCase();
    if (!n.endsWith(ext) || !isGitHubUrl(a.browser_download_url)) return false;
    return kind !== 'win-portable' || n.includes('portable');
  });
  const aliases = ARCH_ALIASES[arch] ?? [arch];
  const allArchNames = Object.values(ARCH_ALIASES).flat();
  const matchesArch = (n: string, list: string[]) =>
    list.some((al) => new RegExp(`(^|[^a-z0-9])${al}([^a-z0-9]|$)`).test(n));
  const exact = candidates.find((a) => matchesArch(a.name.toLowerCase(), aliases));
  if (exact) return exact.browser_download_url;
  const archless = candidates.find(
    (a) =>
      !matchesArch(a.name.toLowerCase(), allArchNames) ||
      a.name.toLowerCase().includes('universal'),
  );
  return archless?.browser_download_url ?? null;
}

// ── Sessiz kontrol hız sınırı ────────────────────────────────────────────────

export function shouldRunSilentCheck(opts: {
  autoCheck: boolean;
  lastCheckAt: number | null;
  now: number;
}): boolean {
  if (!opts.autoCheck) return false;
  if (opts.lastCheckAt === null) return true;
  // Saat geri alınmışsa (last > now) de kontrole izin ver.
  const elapsed = opts.now - opts.lastCheckAt;
  return elapsed < 0 || elapsed >= SILENT_CHECK_INTERVAL_MS;
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const oneLine = msg.split('\n')[0] ?? msg;
  return oneLine.length > MAX_ERROR_LENGTH ? `${oneLine.slice(0, MAX_ERROR_LENGTH)}…` : oneLine;
}

// ── electron-updater alt kümesi (test'te sahte motor enjekte edilir) ─────────

export interface UpdateInfoLike {
  version: string;
  releaseNotes?: unknown;
  releaseDate?: string;
}

export interface ProgressInfoLike {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdaterEngine {
  on(event: 'update-available', cb: (info: UpdateInfoLike) => void): unknown;
  on(event: 'update-not-available', cb: (info: UpdateInfoLike) => void): unknown;
  on(event: 'download-progress', cb: (p: ProgressInfoLike) => void): unknown;
  on(event: 'update-downloaded', cb: (info: UpdateInfoLike) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdaterLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface UpdaterDeps {
  kind: UpdateKind;
  arch: string;
  currentVersion: string;
  repo: RepoRef | null;
  /** Yalnız 'auto' modda ve ilk ihtiyaçta çağrılır (electron-updater tembel yüklenir). */
  loadEngine: () => Promise<UpdaterEngine>;
  /** 'notify' modu: releases/latest. Release yoksa (404) null. */
  fetchLatestRelease: (repo: RepoRef) => Promise<GitHubRelease | null>;
  settings: {
    getAutoCheck(): boolean;
    setAutoCheck(v: boolean): void;
    getLastCheckAt(): number | null;
    setLastCheckAt(v: number): void;
  };
  openExternal: (url: string) => Promise<void>;
  /** quitAndInstall ÖNCESİ çıkış temizliği (şifreli oturum silme) — beklenir. */
  beforeInstall: () => Promise<void>;
  push: (snapshot: UpdateSnapshot) => void;
  log: UpdaterLogger;
  now: () => number;
}

export class UpdaterService {
  readonly mode: UpdateMode;
  private state: UpdateState = { status: 'idle' };
  private engine: UpdaterEngine | null = null;
  private enginePromise: Promise<UpdaterEngine> | null = null;
  /** notify modunda "İndir" hedefi (platforma uygun asset veya release sayfası). */
  private downloadUrl: string | null = null;
  private installing = false;
  /** Son 'available' notları — update-downloaded olayı not taşımayabilir. */
  private availableNotes: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly deps: UpdaterDeps) {
    this.mode = modeForKind(deps.kind);
  }

  getSnapshot(): UpdateSnapshot {
    return {
      currentVersion: this.deps.currentVersion,
      kind: this.deps.kind,
      mode: this.mode,
      autoCheck: this.deps.settings.getAutoCheck(),
      releasesUrl: releasesUrlFor(this.deps.repo),
      lastCheckAt: this.deps.settings.getLastCheckAt(),
      state: this.state,
    };
  }

  private setState(next: UpdateState): void {
    this.state = next;
    this.deps.push(this.getSnapshot());
  }

  private isBusy(): boolean {
    const s = this.state.status;
    return s === 'checking' || s === 'downloading' || s === 'downloaded' || this.installing;
  }

  // ── Motor (electron-updater) ──

  private getEngine(): Promise<UpdaterEngine> {
    if (this.engine) return Promise.resolve(this.engine);
    if (!this.enginePromise) {
      this.enginePromise = this.deps
        .loadEngine()
        .then((engine) => {
          this.attachEngine(engine);
          this.engine = engine;
          return engine;
        })
        .catch((e: unknown) => {
          this.enginePromise = null; // sonraki denemede yeniden yükle
          throw e;
        });
    }
    return this.enginePromise;
  }

  private attachEngine(engine: UpdaterEngine): void {
    engine.on('update-available', (info) => {
      const origin = this.state.status === 'checking' ? this.state.origin : 'manual';
      this.availableNotes = releaseNotesToText(info.releaseNotes);
      this.setState({
        status: 'available',
        version: info.version,
        notes: this.availableNotes,
        date: info.releaseDate ?? null,
        origin,
      });
    });
    engine.on('update-not-available', () => {
      this.setState({ status: 'not-available' });
    });
    engine.on('download-progress', (p) => {
      if (this.state.status !== 'downloading') return;
      this.setState({
        ...this.state,
        percent: Math.max(0, Math.min(100, p.percent)),
        bytesPerSecond: Math.max(0, p.bytesPerSecond),
        transferred: p.transferred,
        total: p.total,
      });
    });
    engine.on('update-downloaded', (info) => {
      this.setState({
        status: 'downloaded',
        version: info.version,
        notes: releaseNotesToText(info.releaseNotes) ?? this.availableNotes,
        date: info.releaseDate ?? null,
      });
    });
    // Hatalar check()/download() promise'lerinde ele alınır; olay yalnız loglanır
    // (çift işlem ve sessiz kontrolde toast'a sızma olmasın).
    engine.on('error', (err) => {
      this.deps.log.warn(`[updater] motor hatası: ${errorMessage(err)}`);
    });
  }

  // ── Kontrol ──

  async check(origin: UpdateCheckOrigin): Promise<UpdateSnapshot> {
    if (this.mode === 'disabled') {
      if (origin === 'manual')
        throw new Error('Güncelleme yalnız kurulu sürümlerde kullanılabilir');
      return this.getSnapshot();
    }
    if (this.isBusy()) return this.getSnapshot();

    this.deps.settings.setLastCheckAt(this.deps.now());
    this.setState({ status: 'checking', origin });
    try {
      if (this.mode === 'auto') await this.checkWithEngine();
      else await this.checkWithGitHub(origin);
    } catch (e) {
      this.fail(e, origin);
    }
    return this.getSnapshot();
  }

  private async checkWithEngine(): Promise<void> {
    const engine = await this.getEngine();
    const result = await engine.checkForUpdates();
    // Olaylar durumu zaten güncelledi; güncelleyici etkin değilse (app-update.yml yok)
    // null döner ve olay gelmez → hata.
    if (this.state.status === 'checking') {
      if (result == null) throw new Error('Güncelleme yapılandırması bulunamadı (app-update.yml)');
      this.setState({ status: 'not-available' });
    }
  }

  private async checkWithGitHub(origin: UpdateCheckOrigin): Promise<void> {
    const repo = this.deps.repo;
    if (!repo) throw new Error('Güncelleme deposu yapılandırılmamış');
    const release = await this.deps.fetchLatestRelease(repo);
    if (!release || release.draft || release.prerelease) {
      this.setState({ status: 'not-available' });
      return;
    }
    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, this.deps.currentVersion) <= 0) {
      this.setState({ status: 'not-available' });
      return;
    }
    const pageUrl = isGitHubUrl(release.html_url) ? release.html_url : releasesUrlFor(repo);
    this.downloadUrl = pickDownloadAsset(this.deps.kind, this.deps.arch, release.assets) ?? pageUrl;
    this.setState({
      status: 'available',
      version,
      notes: releaseNotesToText(release.body),
      date: release.published_at,
      origin,
    });
  }

  private fail(e: unknown, origin: UpdateCheckOrigin): void {
    const message = errorMessage(e);
    if (origin === 'silent') {
      // Sessiz kontrol hatası kullanıcıya gösterilmez — yalnız log.
      this.deps.log.warn(`[updater] sessiz kontrol başarısız: ${message}`);
      this.setState({ status: 'idle' });
      return;
    }
    this.deps.log.error(`[updater] ${message}`);
    this.setState({ status: 'error', message });
  }

  // ── İndirme / kurulum (yalnız 'auto') ──

  async download(): Promise<UpdateSnapshot> {
    if (this.mode !== 'auto') throw new Error('Bu kurulum türü kendini güncelleyemez');
    if (this.state.status !== 'available') return this.getSnapshot();
    const { version } = this.state;
    this.setState({
      status: 'downloading',
      version,
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
    });
    try {
      const engine = await this.getEngine();
      await engine.downloadUpdate();
    } catch (e) {
      this.fail(e, 'manual');
    }
    return this.getSnapshot();
  }

  async install(): Promise<void> {
    if (this.mode !== 'auto') throw new Error('Bu kurulum türü kendini güncelleyemez');
    if (this.state.status !== 'downloaded') throw new Error('İndirilmiş güncelleme yok');
    if (this.installing) return;
    this.installing = true;
    const engine = await this.getEngine();
    try {
      // Çıkış temizliği ÖNCE: NSIS kurucusu quitAndInstall'da başlar ve süreç kapanmasını
      // bekler; şifreli oturum silme gecikirse kurucu uygulamayı zorla kapatabilir.
      await this.deps.beforeInstall();
    } catch (e) {
      // before-quit / will-quit handler'ları silmeyi yeniden dener — kurulumu engelleme.
      this.deps.log.warn(`[updater] kurulum öncesi temizlik hatası: ${errorMessage(e)}`);
    }
    this.deps.log.info('[updater] quitAndInstall (kullanıcı isteği)');
    try {
      engine.quitAndInstall(true, true);
    } catch (e) {
      this.installing = false;
      this.fail(e, 'manual');
    }
  }

  // ── Ayarlar / harici bağlantı ──

  setAutoCheck(value: boolean): UpdateSnapshot {
    this.deps.settings.setAutoCheck(value);
    const snap = this.getSnapshot();
    this.deps.push(snap);
    return snap;
  }

  resolveExternalUrl(target: UpdateOpenTarget): string | null {
    const releases = releasesUrlFor(this.deps.repo);
    const url = target === 'download' ? (this.downloadUrl ?? releases) : releases;
    return isGitHubUrl(url) ? url : null;
  }

  async openExternal(target: UpdateOpenTarget): Promise<boolean> {
    const url = this.resolveExternalUrl(target);
    if (!url) {
      this.deps.log.warn(`[updater] açılacak güvenli GitHub adresi yok (${target})`);
      return false;
    }
    await this.deps.openExternal(url);
    return true;
  }

  // ── Zamanlama ──

  /** Hız sınırına uyarak sessiz kontrol (ayar kapalıysa / 6 saat dolmadıysa atlar). */
  async maybeSilentCheck(): Promise<void> {
    if (this.mode === 'disabled' || this.isBusy()) return;
    const ok = shouldRunSilentCheck({
      autoCheck: this.deps.settings.getAutoCheck(),
      lastCheckAt: this.deps.settings.getLastCheckAt(),
      now: this.deps.now(),
    });
    if (!ok) return;
    await this.check('silent');
  }

  /** Açılıştan ~10 sn sonra ve uzun oturumlarda periyodik sessiz kontrol. */
  scheduleSilentChecks(delayMs = STARTUP_CHECK_DELAY_MS): void {
    if (this.mode === 'disabled') return;
    const run = () => {
      this.maybeSilentCheck().catch((e: unknown) =>
        this.deps.log.warn(`[updater] sessiz kontrol: ${errorMessage(e)}`),
      );
    };
    const first = setTimeout(run, delayMs);
    const periodic = setInterval(run, SILENT_CHECK_INTERVAL_MS);
    first.unref?.();
    periodic.unref?.();
    this.timers.push(first, periodic);
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
