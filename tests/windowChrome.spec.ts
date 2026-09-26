import { describe, it, expect } from 'vitest';
import {
  TITLE_BAR_HEIGHT,
  appMenuTemplate,
  usesTitleBarOverlay,
  windowChromeOptions,
} from '@main/windowChrome';

describe('windowChromeOptions', () => {
  it.each(['win32', 'linux'] as const)('%s: hidden + titleBarOverlay, trafik ışığı yok', (p) => {
    const o = windowChromeOptions(p, true);
    expect(o.titleBarStyle).toBe('hidden');
    expect(o.titleBarOverlay?.height).toBe(TITLE_BAR_HEIGHT);
    expect(o.trafficLightPosition).toBeUndefined();
    expect(usesTitleBarOverlay(p)).toBe(true);
  });

  it('darwin: overlay YOK, trafik ışıkları başlık çubuğuna dikey ortalı', () => {
    const o = windowChromeOptions('darwin', false);
    expect(o.titleBarOverlay).toBeUndefined();
    expect(o.trafficLightPosition).toEqual({ x: 14, y: 14 });
    expect(usesTitleBarOverlay('darwin')).toBe(false);
  });

  it('overlay renkleri temaya göre', () => {
    expect(windowChromeOptions('win32', true).titleBarOverlay?.color).toBe('#0f172a');
    expect(windowChromeOptions('win32', false).titleBarOverlay?.color).toBe('#ffffff');
  });
});

describe('appMenuTemplate', () => {
  it('macOS: appMenu + editMenu + windowMenu (Cmd+Q/C/V/A/Z/W)', () => {
    expect(appMenuTemplate('darwin')).toEqual([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]);
  });

  it.each(['win32', 'linux'] as const)('%s: native menü yok', (p) => {
    expect(appMenuTemplate(p)).toBeNull();
  });
});
