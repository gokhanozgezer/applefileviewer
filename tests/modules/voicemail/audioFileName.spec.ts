import { describe, it, expect } from 'vitest';
import { audioFileName } from '@renderer/routes/voicemail/audioFileName';

describe('audioFileName (toplu ses kopyalama önerilen adı)', () => {
  it('tarih (sayısal, ":" yok) + etiket + uzantı', () => {
    const d = new Date(2024, 0, 2, 10, 30); // yerel saat — format yerel saatle üretir
    expect(audioFileName(d.toISOString(), 'Ahmet', 'amr')).toBe('2024-01-02 10.30 Ahmet.amr');
  });

  it('tarih yok/geçersiz → yalnız etiket', () => {
    expect(audioFileName(null, 'Kayıt 1', 'm4a')).toBe('Kayıt 1.m4a');
    expect(audioFileName('not-a-date', ' Kayıt ', 'm4a')).toBe('Kayıt.m4a');
  });

  it('etiket de boşsa "audio"', () => {
    expect(audioFileName(null, '  ', 'amr')).toBe('audio.amr');
  });
});
