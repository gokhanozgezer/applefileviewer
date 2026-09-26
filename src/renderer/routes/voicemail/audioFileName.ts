// Ses dosyası toplu kopyalamada önerilen okunabilir ad (sesli mesaj + ses kaydı).
// Backup'taki dosya hash adlıdır; kullanıcı klasörde "2024-01-02 10.30 Ahmet.amr"
// görür. Tarih sayısal (dilden bağımsız, sıralanabilir); ':' Windows'ta yasak → '.'.
// Son güvenlik temizliği (yasak karakter, ayrılmış ad, uzunluk) main'de sanitizeName.
import { format } from 'date-fns';

export function audioFileName(dateIso: string | null, label: string, ext: string): string {
  let datePart = '';
  if (dateIso) {
    const d = new Date(dateIso);
    if (!Number.isNaN(d.getTime())) datePart = format(d, 'yyyy-MM-dd HH.mm');
  }
  const name = [datePart, label.trim()].filter(Boolean).join(' ') || 'audio';
  return `${name}.${ext}`;
}
