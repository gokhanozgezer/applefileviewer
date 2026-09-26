import { describe, it, expect } from 'vitest';
import { flattenWaPages } from '@renderer/hooks/useWhatsApp';

describe('flattenWaPages', () => {
  it('pages[0] en yeni sayfa → kronolojik ASC tek liste', () => {
    const pages = [{ items: [5, 6] }, { items: [3, 4] }, { items: [1, 2] }];
    expect(flattenWaPages(pages)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('undefined / boş → []', () => {
    expect(flattenWaPages(undefined)).toEqual([]);
    expect(flattenWaPages([])).toEqual([]);
  });
});
