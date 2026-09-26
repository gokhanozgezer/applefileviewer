import { format } from 'date-fns';
import type { PhotoMeta } from '@shared/domain';
import { dateLocale } from '../../i18n/dateLocale';
import { L } from '../../i18n';

/**
 * Sanal listedeki satır modeli: ay başlığı satırı + tile satırları.
 * Öğeler server'dan ZDATECREATED DESC gelir → ardışık aynı ay tek bölüm.
 * Tarihsiz öğeler (NULL, SQLite DESC'te sonda) tek "Tarihsiz" bölümü olur.
 */
export type GridRow =
  | { type: 'header'; key: string; label: string }
  | {
      type: 'tiles';
      /** items[] içindeki ilk öğe index'i (dahil). */
      start: number;
      /** items[] içindeki son öğe index'i (hariç). */
      end: number;
      /** Bu satırın ait olduğu başlık satırının index'i. */
      header: number;
    };

export interface GridLayout {
  rows: GridRow[];
  /** items index → rows index (klavye gezintisi + scrollToItem). */
  itemRow: Int32Array;
}

function monthKey(iso: string | null): string {
  if (!iso) return 'undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'undated';
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** "Eylül 2024" / "September 2024" — aktif dile göre (dateLocale). */
export function monthLabel(iso: string | null): string {
  if (!iso) return L.photos.undated;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return L.photos.undated;
  const s = format(d, 'LLLL yyyy', { locale: dateLocale() });
  // date-fns en-US 'LLLL' zaten büyük harfli; tr küçük başlar ("eylül") → ilk harf büyük.
  return s.charAt(0).toLocaleUpperCase(dateLocale().code) + s.slice(1);
}

export function buildGridRows(items: readonly PhotoMeta[], columnCount: number): GridLayout {
  const cols = Math.max(1, columnCount);
  const rows: GridRow[] = [];
  const itemRow = new Int32Array(items.length);
  let i = 0;
  while (i < items.length) {
    const key = monthKey(items[i]!.dateTakenIso);
    // Bölüm sonu: ay anahtarı değişene kadar.
    let j = i + 1;
    while (j < items.length && monthKey(items[j]!.dateTakenIso) === key) j++;
    const header = rows.length;
    rows.push({ type: 'header', key: `h-${key}-${i}`, label: monthLabel(items[i]!.dateTakenIso) });
    for (let s = i; s < j; s += cols) {
      const end = Math.min(j, s + cols);
      const rowIdx = rows.length;
      rows.push({ type: 'tiles', start: s, end, header });
      for (let k = s; k < end; k++) itemRow[k] = rowIdx;
    }
    i = j;
  }
  return { rows, itemRow };
}
