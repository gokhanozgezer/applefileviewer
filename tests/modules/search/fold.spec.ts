import { describe, it, expect, beforeEach } from 'vitest';
import { foldText, buildSnippet, findMatch } from '@main/modules/search/fold';
import {
  getCorpus,
  scanCorpus,
  corpusCostOf,
  _resetCorpusCacheForTest,
  _corpusCacheStatsForTest,
  type CorpusRow,
} from '@main/modules/search/corpusCache';

describe('foldText', () => {
  it('uzunluk korur', () => {
    for (const s of ['İSTANBUL ışık', 'Çeşme Göğüş', 'café naïve', 'emoji 😀 test', 'a\nb\tc']) {
      expect(foldText(s)).toHaveLength(s.length);
    }
  });

  it('Türkçe İ/I/ı → i, aksanlar düşer', () => {
    expect(foldText('İSTANBUL')).toBe('istanbul');
    expect(foldText('IŞIK')).toBe('isik');
    expect(foldText('ışık')).toBe('isik');
    expect(foldText('Çeşme Göğüş')).toBe('cesme gogus');
    expect(foldText('Café')).toBe('cafe');
  });

  it('boşluk benzeri karakterler tek boşluk', () => {
    expect(foldText('a\nb\tc d')).toBe('a b c d');
  });

  it('değişmeyen ASCII metin aynı referans', () => {
    const s = 'zaten kucuk';
    expect(foldText(s)).toBe(s);
  });
});

describe('buildSnippet / findMatch', () => {
  it('orijinal metinde doğru aralığı işaretler (Türkçe)', () => {
    const s = buildSnippet('Yarın ŞİRKET toplantısı', foldText('şirket'));
    expect(s.snippet.slice(s.match!.start, s.match!.start + s.match!.length)).toBe('ŞİRKET');
  });

  it('kesilmiş pencerede "…" öneki hesaba katılır', () => {
    const text = 'x'.repeat(100) + ' Hedef ' + 'y'.repeat(100);
    const s = buildSnippet(text, 'hedef');
    expect(s.snippet.startsWith('…')).toBe(true);
    expect(s.snippet.slice(s.match!.start, s.match!.start + s.match!.length)).toBe('Hedef');
  });

  it('eşleşme yoksa match yok', () => {
    expect(buildSnippet('merhaba', 'zzz').match).toBeUndefined();
    expect(findMatch('Şule Güneş', 'gunes')).toEqual({ start: 5, length: 5 });
    expect(findMatch('Şule', 'ahmet')).toBeUndefined();
  });
});

describe('corpusCache', () => {
  beforeEach(() => _resetCorpusCacheForTest());

  const rows = (n: number, len = 10): CorpusRow<number>[] =>
    Array.from({ length: n }, (_, i) => ({ f: `${'a'.repeat(len)}${i}`, m: i }));

  it('aynı anahtar ikinci kez kurulmaz', () => {
    let builds = 0;
    const build = () => {
      builds += 1;
      return rows(3);
    };
    getCorpus('k', build);
    getCorpus('k', build);
    expect(builds).toBe(1);
  });

  it('bütçeyi aşan korpus saklanmaz; bütçe dolunca en eski düşer', () => {
    getCorpus('big', () => rows(10, 1000), 5000);
    expect(_corpusCacheStatsForTest().entries).toBe(0);

    getCorpus('a', () => rows(10, 100), 3000); // ≈ 1320
    getCorpus('b', () => rows(10, 100), 3000); // toplam ≈ 2640
    getCorpus('c', () => rows(10, 100), 3000); // 'a' düşmeli
    const s = _corpusCacheStatsForTest();
    expect(s.entries).toBe(2);
    expect(s.totalCost).toBeLessThanOrEqual(3000);
  });

  it('maliyet üst verideki ham string alanları da sayar (not body / transcript iki kez tutulur)', () => {
    const body = 'x'.repeat(1000);
    const noteRows: CorpusRow<{ id: number; title: string; body: string; tags: string[] }>[] = [
      { f: body, m: { id: 1, title: 'abc', body, tags: ['de', 'f'] } },
    ];
    // f (1000) + title (3) + body (1000) + tags (3) + satır ek yükü
    expect(corpusCostOf(noteRows)).toBe(1000 + 3 + 1000 + 3 + 32);
    // Yalnız f sayılsaydı 1032 ≤ 1500 sığardı; gerçek tutulan ≈ 2038 → saklanmaz
    getCorpus('note', () => noteRows, 1500);
    expect(_corpusCacheStatsForTest().entries).toBe(0);
  });

  it('scanCorpus: herhangi bir iğne, sıra korunur, limit', () => {
    const r: CorpusRow<number>[] = [
      { f: 'ahmet 5423', m: 1 },
      { f: 'mehmet', m: 2 },
      { f: 'ali 542', m: 3 },
    ];
    expect(scanCorpus(r, ['met'], 10).map((x) => x.m)).toEqual([1, 2]);
    expect(scanCorpus(r, ['zzz', '542'], 10).map((x) => x.m)).toEqual([1, 3]);
    expect(scanCorpus(r, ['met'], 1).map((x) => x.m)).toEqual([1]);
    expect(scanCorpus(r, [''], 10)).toEqual([]);
  });
});
