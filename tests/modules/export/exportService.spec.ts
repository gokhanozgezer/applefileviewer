import { describe, it, expect } from 'vitest';
import {
  exportMessageThread,
  exportContacts,
  exportNote,
  exportCallLog,
  exportVoicemails,
  exportVoiceMemos,
  fmtDuration,
  kindSupportsPdf,
  extForFormat,
  csvCell,
} from '@main/modules/export/exportService';
import { EXPORT_CSP_META } from '@main/modules/export/pdfPolicy';
import type {
  Conversation,
  Message,
  Contact,
  Note,
  CallRecord,
  Voicemail,
  VoiceMemo,
} from '@shared/domain';

const conversation: Conversation = {
  chatId: 1,
  displayName: 'Ali Veli',
  identifier: '+905551112233',
  contactName: 'Ali Veli',
  lastMessagePreview: 'selam',
  lastMessageDateIso: '2024-01-01T10:00:00.000Z',
  dominantService: 'iMessage',
  messageCount: 2,
};

const messages: Message[] = [
  {
    rowId: 1,
    text: 'Merhaba <dünya> & "test"',
    service: 'iMessage',
    isFromMe: false,
    dateIso: '2024-01-01T10:00:00.000Z',
    handle: '+905551112233',
    contactName: 'Ali Veli',
    attachments: [],
  },
  {
    rowId: 2,
    text: 'Cevap',
    service: 'iMessage',
    isFromMe: true,
    dateIso: '2024-01-01T10:01:00.000Z',
    handle: null,
    contactName: null,
    attachments: [{ fileId: 'abc', filename: 'foto.jpg', mimeType: 'image/jpeg', kind: 'image' }],
  },
];

describe('exportMessageThread', () => {
  it('JSON — conversation + messages içerir, valid JSON', () => {
    const out = exportMessageThread(conversation, messages, 'json');
    const parsed = JSON.parse(out);
    expect(parsed.conversation.chatId).toBe(1);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].text).toBe('Cevap');
  });

  it('HTML — bubble layout, HTML escape edilmiş, ek sayısı görünür', () => {
    const out = exportMessageThread(conversation, messages, 'html');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('class="bubble"');
    // < ve & escape edilmeli, ham <dünya> sızmamalı
    expect(out).toContain('Merhaba &lt;dünya&gt; &amp; &quot;test&quot;');
    expect(out).not.toContain('Merhaba <dünya>');
    // ek bilgisi
    expect(out).toContain('1 ek');
    expect(out).toContain('foto.jpg');
    // mesaj sayısı başlık
    expect(out).toContain('2 mesaj');
  });
});

describe('exportContacts', () => {
  const contacts: Contact[] = [
    {
      id: 1,
      displayName: 'Ayşe Yıldız',
      firstName: 'Ayşe',
      lastName: 'Yıldız',
      organization: 'Acme A.Ş.',
      jobTitle: 'Mühendis',
      note: 'arkadaş; iş',
      birthdayIso: '1990-05-15T00:00:00.000Z',
      phones: ['+905551112233', '+905554445566'],
      emails: ['ayse@example.com'],
      addresses: ['İstanbul, Türkiye'],
    },
  ];

  it('JSON — dizi olarak çıkar', () => {
    const out = exportContacts(contacts, 'json');
    const parsed = JSON.parse(out);
    expect(parsed[0].displayName).toBe('Ayşe Yıldız');
  });

  it('CSV — başlık + satır, virgül/quote escape (RFC 4180)', () => {
    const out = exportContacts(contacts, 'csv');
    const lines = out.split('\r\n');
    expect(lines[0]).toContain('"displayName"');
    expect(lines[1]).toContain('"Ayşe Yıldız"');
    // çoklu telefon "; " ile birleşik tek hücrede
    expect(lines[1]).toContain('"+905551112233; +905554445566"');
  });

  it('vCard — BEGIN/END, FN, TEL, EMAIL satırları + escape', () => {
    const out = exportContacts(contacts, 'vcard');
    expect(out).toContain('BEGIN:VCARD');
    expect(out).toContain('VERSION:3.0');
    expect(out).toContain('FN:Ayşe Yıldız');
    expect(out).toContain('N:Yıldız;Ayşe;;;');
    expect(out).toContain('TEL;TYPE=CELL:+905551112233');
    expect(out).toContain('EMAIL;TYPE=INTERNET:ayse@example.com');
    expect(out).toContain('ORG:Acme A.Ş.');
    expect(out).toContain('BDAY:1990-05-15');
    // note içindeki ; escape edilmeli
    expect(out).toContain('NOTE:arkadaş\\; iş');
    expect(out).toContain('END:VCARD');
  });
});

describe('exportNote', () => {
  const note: Note = {
    id: 1,
    title: 'Alışveriş',
    snippet: 'süt',
    body: 'süt\nekmek\nyumurta',
    runs: [],
    createdIso: '2024-01-01T08:00:00.000Z',
    modifiedIso: '2024-01-02T09:00:00.000Z',
    folderName: 'Ev',
  };

  it('txt — başlık + body düz metin', () => {
    const out = exportNote(note, 'txt');
    expect(out).toContain('Alışveriş');
    expect(out).toContain('Klasör: Ev');
    expect(out).toContain('süt\nekmek\nyumurta');
  });

  it('html — escape + body', () => {
    const out = exportNote({ ...note, body: '<b>kalın</b>' }, 'html');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('&lt;b&gt;kalın&lt;/b&gt;');
  });
});

describe('exportCallLog', () => {
  const calls: CallRecord[] = [
    {
      id: 1,
      dateIso: '2024-01-01T10:00:00.000Z',
      durationSec: 120,
      direction: 'incoming',
      isMissed: false,
      callType: 'phone',
      number: '+905551112233',
      contactName: 'Ali',
    },
  ];

  it('JSON', () => {
    expect(JSON.parse(exportCallLog(calls, 'json'))[0].number).toBe('+905551112233');
  });

  it('CSV — başlık + satır', () => {
    const out = exportCallLog(calls, 'csv');
    expect(out.split('\r\n')[0]).toContain('"direction"');
    expect(out).toContain('"incoming"');
    expect(out).toContain('"120"');
  });
});

describe('extForFormat', () => {
  it('format → uzantı eşlemesi', () => {
    expect(extForFormat('json')).toBe('json');
    expect(extForFormat('html')).toBe('html');
    expect(extForFormat('csv')).toBe('csv');
    expect(extForFormat('vcard')).toBe('vcf');
    expect(extForFormat('txt')).toBe('txt');
  });
});

describe('HTML çıktılarında CSP (script/ağ yasak)', () => {
  it('mesaj, not ve liste HTML’leri CSP meta taşır', () => {
    const outs = [
      exportMessageThread(conversation, messages, 'html'),
      exportNote(
        {
          id: 1,
          title: 't',
          snippet: '',
          body: 'b',
          runs: [],
          createdIso: null,
          modifiedIso: null,
          folderName: null,
        },
        'html',
      ),
      exportCallLog([], 'html'),
      exportVoicemails([], 'html'),
      exportVoiceMemos([], 'html'),
    ];
    for (const out of outs) expect(out).toContain(EXPORT_CSP_META);
  });
});

describe('exportCallLog — html (PDF kaynağı)', () => {
  const calls: CallRecord[] = [
    {
      id: 1,
      dateIso: '2024-01-01T10:00:00.000Z',
      durationSec: 3725,
      direction: 'outgoing',
      isMissed: false,
      callType: 'facetime-video',
      number: '+905551112233',
      contactName: '<script>x</script>',
    },
    {
      id: 2,
      dateIso: null,
      durationSec: 0,
      direction: 'incoming',
      isMissed: true,
      callType: 'phone',
      number: '555',
      contactName: null,
    },
  ];

  it('tablo satırları, süre biçimi, escape', () => {
    const out = exportCallLog(calls, 'html');
    expect(out).toContain('<table>');
    expect(out).toContain('2 arama');
    expect(out).toContain('1:02:05');
    expect(out).toContain('FaceTime Video');
    expect(out).toContain('Cevapsız');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>x');
  });
});

describe('exportVoicemails / exportVoiceMemos', () => {
  const vms: Voicemail[] = [
    {
      id: 1,
      dateIso: '2024-02-01T10:00:00.000Z',
      durationSec: 42,
      sender: '+905550000000',
      contactName: 'Ay"şe',
      fileId: 'f'.repeat(40),
      isUnplayed: true,
    },
  ];
  const memos: VoiceMemo[] = [
    { id: 1, title: 'Toplantı, notlar', dateIso: null, durationSec: 61, fileId: 'e'.repeat(40) },
  ];

  it('voicemail CSV — başlık + RFC 4180 escape', () => {
    const lines = exportVoicemails(vms, 'csv').split('\r\n');
    expect(lines[0]).toBe('"date","sender","contactName","durationSec","unplayed","fileId"');
    expect(lines[1]).toContain('"Ay""şe"');
    expect(lines[1]).toContain('"yes"');
  });

  it('voicemail HTML — süre + dinlenmedi', () => {
    const out = exportVoicemails(vms, 'html');
    expect(out).toContain('0:42');
    expect(out).toContain('Hayır');
    expect(out).toContain('Ay&quot;şe');
  });

  it('voice memo CSV + HTML', () => {
    const csv = exportVoiceMemos(memos, 'csv');
    expect(csv.split('\r\n')[1]).toContain('"Toplantı, notlar"');
    const html = exportVoiceMemos(memos, 'html');
    expect(html).toContain('1:01');
    expect(html).toContain('1 kayıt');
  });
});

describe('CSV formula injection', () => {
  it("csvCell: = + - @ TAB CR ile başlayan formül hücresine ' eklenir", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(csvCell("+cmd|' /C calc'!A0")).toBe("\"'+cmd|' /C calc'!A0\"");
    expect(csvCell('-2+3+cmd|x')).toBe('"\'-2+3+cmd|x"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('\t=1')).toBe('"\'\t=1"');
    expect(csvCell('\r=1')).toBe('"\'\r=1"');
    expect(csvCell('=1')).toBe('"\'=1"');
  });

  it('csvCell: sayı/telefon ve normal metin değişmez', () => {
    expect(csvCell('-5')).toBe('"-5"');
    expect(csvCell('+905551112233; +905554445566')).toBe('"+905551112233; +905554445566"');
    expect(csvCell('+90 (555) 111-22-33')).toBe('"+90 (555) 111-22-33"');
    expect(csvCell('Ali = Veli')).toBe('"Ali = Veli"');
    expect(csvCell('')).toBe('""');
  });

  it('tüm CSV export türlerinde uygulanır (kişiler, aramalar, sesli mesaj, ses kaydı)', () => {
    const evil = '=HYPERLINK("http://evil","x")';
    const contact = {
      id: 1,
      displayName: evil,
      firstName: null,
      lastName: null,
      organization: null,
      jobTitle: null,
      phones: [],
      emails: [],
      addresses: [],
      birthdayIso: null,
      note: null,
    } as unknown as Contact;
    const call = {
      id: 1,
      dateIso: null,
      durationSec: 1,
      direction: 'incoming',
      isMissed: false,
      callType: 'phone',
      number: '+1',
      contactName: evil,
    } as unknown as CallRecord;
    const vm = {
      id: 1,
      dateIso: null,
      durationSec: 1,
      sender: '+1',
      contactName: evil,
      fileId: 'f'.repeat(40),
      isUnplayed: false,
    } as unknown as Voicemail;
    const memo = { id: 1, title: evil, dateIso: null, durationSec: 1, fileId: 'e'.repeat(40) };
    for (const out of [
      exportContacts([contact], 'csv'),
      exportCallLog([call], 'csv'),
      exportVoicemails([vm], 'csv'),
      exportVoiceMemos([memo as VoiceMemo], 'csv'),
    ]) {
      expect(out).toContain('"\'=HYPERLINK(');
      expect(out).not.toMatch(/(^|,)"=HYPERLINK/m);
    }
  });
});

describe('fmtDuration', () => {
  it('saniye → m:ss / h:mm:ss; 0 → —', () => {
    expect(fmtDuration(0)).toBe('—');
    expect(fmtDuration(-1)).toBe('—');
    expect(fmtDuration(59)).toBe('0:59');
    expect(fmtDuration(600)).toBe('10:00');
    expect(fmtDuration(3600)).toBe('1:00:00');
  });
});

describe('kindSupportsPdf', () => {
  it('HTML çıktısı olan kind’lar PDF destekler', () => {
    for (const k of ['messageThread', 'waThread', 'note', 'callLog', 'voicemails', 'voiceMemos']) {
      expect(kindSupportsPdf(k)).toBe(true);
    }
    expect(kindSupportsPdf('contacts')).toBe(false);
  });
});
