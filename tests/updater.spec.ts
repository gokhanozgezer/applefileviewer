// updaterCore — yetenek matrisi, durum makinesi, hız sınırı, sessiz hata bastırma,
// kurulum öncesi temizlik sırası. electron-updater yerine sahte motor enjekte edilir.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  UpdaterService,
  SILENT_CHECK_INTERVAL_MS,
  STARTUP_CHECK_DELAY_MS,
  compareVersions,
  detectUpdateKind,
  modeForKind,
  parseGitHubRelease,
  parseGitHubRepo,
  pickDownloadAsset,
  releaseNotesToText,
  shouldRunSilentCheck,
  type GitHubRelease,
  type UpdaterDeps,
  type UpdaterEngine,
} from '@main/updaterCore';
import { isGitHubUrl } from '@main/windowPolicy';
import type { UpdateKind, UpdateSnapshot } from '@shared/ipc';

const REPO = { owner: 'gokhanozgezer', repo: 'applefileviewer' };
const RELEASES = 'https://github.com/gokhanozgezer/applefileviewer/releases';
const DL = `${RELEASES}/download/v0.2.0`;

class FakeEngine extends EventEmitter {
  checkImpl: () => Promise<unknown> = async () => {
    this.emit('update-available', { version: '0.2.0', releaseNotes: '<p>Yeni <b>özellik</b></p>' });
    return { updateInfo: { version: '0.2.0' } };
  };
  downloadImpl: () => Promise<unknown> = async () => {
    this.emit('download-progress', {
      percent: 50,
      bytesPerSecond: 1000,
      transferred: 5,
      total: 10,
    });
    this.emit('update-downloaded', { version: '0.2.0', releaseDate: '2026-09-01T00:00:00Z' });
    return ['file'];
  };
  checkForUpdates = vi.fn(() => this.checkImpl());
  downloadUpdate = vi.fn(() => this.downloadImpl());
  quitAndInstall = vi.fn();
}

function release(over: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tag_name: 'v0.2.0',
    html_url: `${RELEASES}/tag/v0.2.0`,
    body: '## Notlar\n- düzeltme',
    published_at: '2026-09-01T00:00:00Z',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'AppleFileViewer-0.2.0-arm64.dmg',
        browser_download_url: `${DL}/AppleFileViewer-0.2.0-arm64.dmg`,
      },
      {
        name: 'AppleFileViewer-0.2.0-x64.dmg',
        browser_download_url: `${DL}/AppleFileViewer-0.2.0-x64.dmg`,
      },
      {
        name: 'applefileviewer_0.2.0_amd64.deb',
        browser_download_url: `${DL}/applefileviewer_0.2.0_amd64.deb`,
      },
      {
        name: 'AppleFileViewer-Portable-0.2.0-x64.exe',
        browser_download_url: `${DL}/AppleFileViewer-Portable-0.2.0-x64.exe`,
      },
      {
        name: 'AppleFileViewer-Setup-0.2.0-x64.exe',
        browser_download_url: `${DL}/AppleFileViewer-Setup-0.2.0-x64.exe`,
      },
    ],
    ...over,
  };
}

function setup(kind: UpdateKind, over: Partial<UpdaterDeps> = {}) {
  const engine = new FakeEngine();
  const store = { autoCheck: true, lastCheckAt: null as number | null };
  const pushes: UpdateSnapshot[] = [];
  const calls: string[] = [];
  const deps: UpdaterDeps = {
    kind,
    arch: 'arm64',
    currentVersion: '0.1.0',
    repo: REPO,
    loadEngine: vi.fn(async () => engine as unknown as UpdaterEngine),
    fetchLatestRelease: vi.fn(async () => release()),
    settings: {
      getAutoCheck: () => store.autoCheck,
      setAutoCheck: (v) => {
        store.autoCheck = v;
      },
      getLastCheckAt: () => store.lastCheckAt,
      setLastCheckAt: (v) => {
        store.lastCheckAt = v;
      },
    },
    openExternal: vi.fn(async () => undefined),
    beforeInstall: vi.fn(async () => {
      calls.push('beforeInstall');
    }),
    push: (s) => pushes.push(s),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => 1_000_000_000_000,
    ...over,
  };
  engine.quitAndInstall.mockImplementation(() => calls.push('quitAndInstall'));
  const svc = new UpdaterService(deps);
  return { svc, engine, store, pushes, calls, deps };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('yetenek matrisi', () => {
  const cases: Array<[string, Parameters<typeof detectUpdateKind>[0], UpdateKind, string]> = [
    ['dev', { isPackaged: false, platform: 'win32', env: {} }, 'dev', 'disabled'],
    ['win-nsis', { isPackaged: true, platform: 'win32', env: {} }, 'win-nsis', 'auto'],
    [
      'win-portable',
      { isPackaged: true, platform: 'win32', env: { PORTABLE_EXECUTABLE_DIR: 'C:\\x' } },
      'win-portable',
      'notify',
    ],
    ['mac', { isPackaged: true, platform: 'darwin', env: {} }, 'mac', 'notify'],
    [
      'linux-appimage',
      { isPackaged: true, platform: 'linux', env: { APPIMAGE: '/x.AppImage' } },
      'linux-appimage',
      'auto',
    ],
    ['linux-deb', { isPackaged: true, platform: 'linux', env: {} }, 'linux-deb', 'notify'],
    ['freebsd', { isPackaged: true, platform: 'freebsd', env: {} }, 'unsupported', 'disabled'],
  ];
  it.each(cases)('%s', (_n, info, kind, mode) => {
    expect(detectUpdateKind(info)).toBe(kind);
    expect(modeForKind(kind)).toBe(mode);
  });
});

describe('saf yardımcılar', () => {
  it('parseGitHubRepo package.json repository biçimlerini çözer', () => {
    for (const raw of [
      'gokhanozgezer/applefileviewer',
      'github:gokhanozgezer/applefileviewer',
      'https://github.com/gokhanozgezer/applefileviewer',
      'https://github.com/gokhanozgezer/applefileviewer.git',
      'git+https://github.com/gokhanozgezer/applefileviewer.git',
      'git@github.com:gokhanozgezer/applefileviewer.git',
    ]) {
      expect(parseGitHubRepo(raw)).toEqual(REPO);
    }
    for (const bad of ['', undefined, 'https://gitlab.com/a/b', 'a/b/c', '../x', 'a b/c']) {
      expect(parseGitHubRepo(bad)).toBeNull();
    }
  });

  it('compareVersions', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('garbage', '1.0.0')).toBe(0);
  });

  it('releaseNotesToText uzak HTML’i düz metne çevirir (script/etiket yok)', () => {
    const txt = releaseNotesToText(
      '<h2>Yeni</h2><script>alert(1)</script><ul><li>A &amp; B</li><li><img src=x onerror=alert(1)>C</li></ul>',
    );
    expect(txt).not.toMatch(/<|script|onerror|alert/);
    expect(txt).toContain('A & B');
    expect(txt).toContain('• C');
    expect(releaseNotesToText([{ version: '0.2.0', note: '<p>x</p>' }])).toBe('0.2.0\nx');
    expect(releaseNotesToText(null)).toBeNull();
    expect(releaseNotesToText('   ')).toBeNull();
  });

  it('parseGitHubRelease güvenilmeyen JSON’u doğrular', () => {
    expect(parseGitHubRelease(null)).toBeNull();
    expect(parseGitHubRelease({ tag_name: 1 })).toBeNull();
    const r = parseGitHubRelease({
      tag_name: 'v1.0.0',
      html_url: RELEASES,
      assets: [{ name: 'a.dmg', browser_download_url: 'x' }, { bogus: true }],
    });
    expect(r?.assets).toHaveLength(1);
    expect(r?.body).toBeNull();
  });

  it('pickDownloadAsset platform + mimariye uygun github asset’ini seçer', () => {
    const { assets } = release();
    expect(pickDownloadAsset('mac', 'arm64', assets)).toMatch(/arm64\.dmg$/);
    expect(pickDownloadAsset('mac', 'x64', assets)).toMatch(/x64\.dmg$/);
    expect(pickDownloadAsset('linux-deb', 'x64', assets)).toMatch(/amd64\.deb$/);
    expect(pickDownloadAsset('win-portable', 'x64', assets)).toMatch(/Portable.*\.exe$/);
    expect(pickDownloadAsset('win-nsis', 'x64', assets)).toBeNull();
    // universal (mimarisiz) dmg geri dönüşü
    expect(
      pickDownloadAsset('mac', 'arm64', [
        {
          name: 'AppleFileViewer-0.2.0.dmg',
          browser_download_url: `${DL}/AppleFileViewer-0.2.0.dmg`,
        },
      ]),
    ).toMatch(/0\.2\.0\.dmg$/);
    // github dışı bağlantı asla seçilmez
    expect(
      pickDownloadAsset('mac', 'arm64', [
        { name: 'x-arm64.dmg', browser_download_url: 'https://evil.example/x-arm64.dmg' },
      ]),
    ).toBeNull();
  });

  it('isGitHubUrl yalnız https://github.com kabul eder', () => {
    expect(isGitHubUrl(RELEASES)).toBe(true);
    expect(isGitHubUrl('http://github.com/a/b')).toBe(false);
    expect(isGitHubUrl('https://github.com.evil.io/a')).toBe(false);
    expect(isGitHubUrl('https://api.github.com/a')).toBe(false);
    expect(isGitHubUrl('https://user@github.com/a')).toBe(false);
    expect(isGitHubUrl('https://github.com:8443/a')).toBe(false);
    expect(isGitHubUrl('javascript:alert(1)')).toBe(false);
  });

  it('shouldRunSilentCheck 6 saat hız sınırı', () => {
    const now = 10 * SILENT_CHECK_INTERVAL_MS;
    expect(shouldRunSilentCheck({ autoCheck: true, lastCheckAt: null, now })).toBe(true);
    expect(shouldRunSilentCheck({ autoCheck: false, lastCheckAt: null, now })).toBe(false);
    expect(shouldRunSilentCheck({ autoCheck: true, lastCheckAt: now - 1000, now })).toBe(false);
    expect(
      shouldRunSilentCheck({ autoCheck: true, lastCheckAt: now - SILENT_CHECK_INTERVAL_MS, now }),
    ).toBe(true);
    // saat geri alınmış
    expect(shouldRunSilentCheck({ autoCheck: true, lastCheckAt: now + 5000, now })).toBe(true);
  });
});

describe('UpdaterService — auto (win-nsis / linux-appimage)', () => {
  it.each(['win-nsis', 'linux-appimage'] as const)(
    '%s: check → available → download → downloaded → install',
    async (kind) => {
      const { svc, engine, calls, pushes, store } = setup(kind);
      await svc.check('manual');
      expect(store.lastCheckAt).toBe(1_000_000_000_000);
      const st = svc.getSnapshot().state;
      expect(st).toMatchObject({ status: 'available', version: '0.2.0', origin: 'manual' });
      expect(st.status === 'available' && st.notes).toBe('Yeni özellik');
      expect(pushes.some((p) => p.state.status === 'checking')).toBe(true);

      await svc.download();
      expect(pushes.some((p) => p.state.status === 'downloading' && p.state.percent === 50)).toBe(
        true,
      );
      expect(svc.getSnapshot().state).toMatchObject({
        status: 'downloaded',
        version: '0.2.0',
        notes: 'Yeni özellik', // indirme olayında not yoksa available'dakiler korunur
      });

      await svc.install();
      // Temizlik (şifreli oturum silme) quitAndInstall'dan ÖNCE tamamlanır
      expect(calls).toEqual(['beforeInstall', 'quitAndInstall']);
      expect(engine.quitAndInstall).toHaveBeenCalledWith(true, true);
      // ikinci tıklama yeniden kurmaz
      await svc.install();
      expect(engine.quitAndInstall).toHaveBeenCalledTimes(1);
    },
  );

  it('beforeInstall asenkron bitmeden quitAndInstall çağrılmaz', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { svc, engine } = setup('win-nsis', { beforeInstall: () => gate });
    await svc.check('manual');
    await svc.download();
    const p = svc.install();
    await new Promise((r) => setTimeout(r, 5));
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    release();
    await p;
    expect(engine.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('beforeInstall hatası kurulumu engellemez (before-quit/will-quit yeniden dener)', async () => {
    const { svc, engine, deps } = setup('win-nsis', {
      beforeInstall: () => Promise.reject(new Error('EBUSY')),
    });
    await svc.check('manual');
    await svc.download();
    await svc.install();
    expect(engine.quitAndInstall).toHaveBeenCalled();
    expect(deps.log.warn).toHaveBeenCalled();
  });

  it('install yalnız downloaded durumunda', async () => {
    const { svc, engine } = setup('win-nsis');
    await expect(svc.install()).rejects.toThrow();
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
  });

  it('güncelleme yok → not-available', async () => {
    const { svc, engine } = setup('win-nsis');
    engine.checkImpl = async () => {
      engine.emit('update-not-available', { version: '0.1.0' });
      return { updateInfo: { version: '0.1.0' } };
    };
    await svc.check('manual');
    expect(svc.getSnapshot().state.status).toBe('not-available');
  });

  it('checkForUpdates null (app-update.yml yok) → manuel hata', async () => {
    const { svc, engine } = setup('win-nsis');
    engine.checkImpl = async () => null;
    await svc.check('manual');
    expect(svc.getSnapshot().state).toMatchObject({ status: 'error' });
  });

  it('manuel kontrol hatası error durumuna düşer', async () => {
    const { svc, engine, deps } = setup('win-nsis');
    engine.checkImpl = async () => {
      engine.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
      throw new Error('net::ERR_INTERNET_DISCONNECTED');
    };
    await svc.check('manual');
    expect(svc.getSnapshot().state).toEqual({
      status: 'error',
      message: 'net::ERR_INTERNET_DISCONNECTED',
    });
    expect(deps.log.error).toHaveBeenCalled();
  });

  it('sessiz kontrol hatası kullanıcıya gösterilmez (idle + yalnız log)', async () => {
    const { svc, engine, pushes, deps } = setup('win-nsis');
    engine.checkImpl = async () => {
      throw new Error('403 rate limit');
    };
    await svc.check('silent');
    expect(svc.getSnapshot().state).toEqual({ status: 'idle' });
    expect(pushes.some((p) => p.state.status === 'error')).toBe(false);
    expect(deps.log.warn).toHaveBeenCalledWith(expect.stringContaining('403 rate limit'));
    expect(deps.log.error).not.toHaveBeenCalled();
  });

  it('sessiz kontrolde bulunan sürüm origin=silent taşır (banner)', async () => {
    const { svc } = setup('win-nsis');
    await svc.check('silent');
    expect(svc.getSnapshot().state).toMatchObject({ status: 'available', origin: 'silent' });
  });

  it('indirme hatası error durumuna düşer', async () => {
    const { svc, engine } = setup('linux-appimage');
    engine.downloadImpl = async () => {
      throw new Error('sha512 checksum mismatch');
    };
    await svc.check('manual');
    await svc.download();
    expect(svc.getSnapshot().state).toMatchObject({ status: 'error' });
  });

  it('meşgulken ikinci kontrol yoksayılır; motor bir kez yüklenir', async () => {
    const { svc, engine, deps } = setup('win-nsis');
    let resolve!: (v: unknown) => void;
    engine.checkImpl = () => new Promise((r) => (resolve = r));
    const a = svc.check('manual');
    await new Promise((r) => setTimeout(r, 0));
    await svc.check('manual');
    engine.emit('update-not-available', {});
    resolve({});
    await a;
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(deps.loadEngine).toHaveBeenCalledTimes(1);
  });
});

describe('UpdaterService — notify (mac / win-portable / linux-deb)', () => {
  it('mac: GitHub API ile bildirir, motor ASLA yüklenmez, indirme/kurulum reddedilir', async () => {
    const { svc, deps } = setup('mac');
    await svc.check('manual');
    expect(svc.getSnapshot().state).toMatchObject({
      status: 'available',
      version: '0.2.0',
      notes: '## Notlar\n- düzeltme',
      date: '2026-09-01T00:00:00Z',
    });
    await expect(svc.download()).rejects.toThrow();
    await expect(svc.install()).rejects.toThrow();
    expect(deps.loadEngine).not.toHaveBeenCalled();
    expect(await svc.openExternal('download')).toBe(true);
    expect(deps.openExternal).toHaveBeenCalledWith(`${DL}/AppleFileViewer-0.2.0-arm64.dmg`);
  });

  it('win-portable: portable exe bağlantısı; deb: .deb bağlantısı', async () => {
    const p = setup('win-portable', { arch: 'x64' });
    await p.svc.check('manual');
    expect(p.svc.resolveExternalUrl('download')).toMatch(/Portable.*\.exe$/);
    const d = setup('linux-deb', { arch: 'x64' });
    await d.svc.check('manual');
    expect(d.svc.resolveExternalUrl('download')).toMatch(/\.deb$/);
    expect(d.deps.loadEngine).not.toHaveBeenCalled();
  });

  it('aynı/eski sürüm, taslak, ön-sürüm, 404 → not-available', async () => {
    for (const r of [
      release({ tag_name: 'v0.1.0' }),
      release({ draft: true }),
      release({ prerelease: true }),
      null,
    ]) {
      const { svc } = setup('mac', { fetchLatestRelease: vi.fn(async () => r) });
      await svc.check('manual');
      expect(svc.getSnapshot().state.status).toBe('not-available');
    }
  });

  it('asset yoksa release sayfasına düşer; github dışı html_url kullanılmaz', async () => {
    const { svc } = setup('mac', {
      fetchLatestRelease: vi.fn(async () =>
        release({ assets: [], html_url: 'https://evil.example/r' }),
      ),
    });
    await svc.check('manual');
    expect(svc.resolveExternalUrl('download')).toBe(RELEASES);
  });

  it('repo yapılandırılmamış: manuel hata, releasesUrl null, openExternal false', async () => {
    const { svc, deps } = setup('mac', { repo: null });
    await svc.check('manual');
    expect(svc.getSnapshot()).toMatchObject({ releasesUrl: null, state: { status: 'error' } });
    expect(await svc.openExternal('releases')).toBe(false);
    expect(deps.openExternal).not.toHaveBeenCalled();
  });
});

describe('UpdaterService — dev (paketlenmemiş)', () => {
  it('kontrol yok; manuel istek hata; releases sayfası yine açılabilir', async () => {
    const { svc, deps } = setup('dev');
    expect(svc.mode).toBe('disabled');
    await expect(svc.check('manual')).rejects.toThrow();
    await svc.check('silent');
    await svc.maybeSilentCheck();
    expect(deps.loadEngine).not.toHaveBeenCalled();
    expect(deps.fetchLatestRelease).not.toHaveBeenCalled();
    expect(svc.getSnapshot().releasesUrl).toBe(RELEASES);
    expect(await svc.openExternal('releases')).toBe(true);
    expect(deps.openExternal).toHaveBeenCalledWith(RELEASES);
  });
});

describe('UpdaterService — zamanlama / hız sınırı', () => {
  it('açılıştan 10 sn sonra sessiz kontrol; 6 saat dolmadan tekrar yok', async () => {
    vi.useFakeTimers();
    let now = 5 * SILENT_CHECK_INTERVAL_MS;
    const { svc, engine } = setup('win-nsis', { now: () => now });
    engine.checkImpl = async () => {
      engine.emit('update-not-available', {});
      return {};
    };
    svc.scheduleSilentChecks();
    await vi.advanceTimersByTimeAsync(STARTUP_CHECK_DELAY_MS - 1);
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);

    now += 60_000;
    await svc.maybeSilentCheck();
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);

    now += SILENT_CHECK_INTERVAL_MS;
    await vi.advanceTimersByTimeAsync(SILENT_CHECK_INTERVAL_MS);
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(2);
    svc.dispose();
  });

  it('otomatik denetim kapalıysa sessiz kontrol yapılmaz; ayar push edilir', async () => {
    const { svc, engine, pushes } = setup('win-nsis');
    svc.setAutoCheck(false);
    expect(pushes.at(-1)?.autoCheck).toBe(false);
    await svc.maybeSilentCheck();
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
    // manuel kontrol ayardan bağımsız
    await svc.check('manual');
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('hız sınırı persist edilen lastCheckAt’e göre (yeniden başlatma sonrası)', async () => {
    const now = 100 * SILENT_CHECK_INTERVAL_MS;
    const { svc, engine, store } = setup('win-nsis', { now: () => now });
    store.lastCheckAt = now - 60 * 60 * 1000; // 1 saat önce
    await svc.maybeSilentCheck();
    expect(engine.checkForUpdates).not.toHaveBeenCalled();
  });
});
