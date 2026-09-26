import {
  format,
  isToday,
  isYesterday,
  isThisYear,
  differenceInMinutes,
  differenceInHours,
} from 'date-fns';
import { L } from '../../i18n';
import { dateLocale } from '../../i18n/dateLocale';

/** Sohbet listesi timestamp: "10dk", "Dün", "9 May", "9 May 2024". */
export function formatListTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const mins = differenceInMinutes(now, d);
  if (mins < 1) return L.time.now;
  if (mins < 60) return `${mins}${L.time.minuteSuffix}`;
  if (isToday(d)) return `${differenceInHours(now, d)}${L.time.hourSuffix}`;
  if (isYesterday(d)) return L.time.yesterday;
  if (isThisYear(d)) return format(d, 'd MMM', { locale: dateLocale() });
  return format(d, 'd MMM yyyy', { locale: dateLocale() });
}

/** Tarih ayraç başlığı: "9 Mayıs 2024". */
export function formatDateDivider(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return format(d, 'd MMMM yyyy', { locale: dateLocale() });
}

/** Hover bubble zaman damgası: "14:32". */
export function formatBubbleTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return format(d, 'HH:mm', { locale: dateLocale() });
}

/** Gün anahtarı (yyyy-MM-dd) — tarih ayraç gruplaması için. */
export function dayKey(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return format(d, 'yyyy-MM-dd');
}
