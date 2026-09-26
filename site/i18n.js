/* global window */
// Translations for the landing page. Keys match data-i18n / data-i18n-html / data-i18n-aria /
// data-i18n-alt attributes in index.html plus a few used from app.js. English is the source
// (also hard-coded in index.html for no-JS visitors and crawlers).
// data-i18n-html values are trusted static strings from this file only (code/strong/em tags).
window.AFV_I18N = {
  en: {
    'meta.title': 'AppleFileViewer — free iPhone backup viewer for Windows, macOS & Linux',
    'meta.description':
      'Free, open-source and fully offline viewer for iPhone backups: photos, messages, WhatsApp, calls, voicemail, notes, voice memos and contacts — including encrypted backups.',
    'a11y.skip': 'Skip to content',
    'a11y.primaryNav': 'Primary',
    'a11y.language': 'Language',
    'a11y.theme': 'Toggle dark mode',
    'nav.features': 'Features',
    'nav.screenshots': 'Screenshots',
    'nav.privacy': 'Privacy',
    'nav.install': 'Install',
    'nav.faq': 'FAQ',
    'hero.badge': 'Free & open source · Windows · macOS · Linux',
    'hero.title': 'Your iPhone backups, finally readable.',
    'hero.subtitle':
      'AppleFileViewer opens the backups that iTunes, Finder or Apple Devices save on your computer and shows your photos, messages, WhatsApp chats, calls, notes and more — offline, read-only and free.',
    'hero.downloadGeneric': 'Download',
    'hero.downloadFor': 'Download for {os}',
    'hero.otherPlatforms': 'Other platforms',
    'hero.alt.windows': 'Prefer no installation? Get the portable version',
    'hero.alt.macArm': 'Intel Mac? Download the x64 version',
    'hero.alt.macIntel': 'Apple Silicon Mac? Download the arm64 version',
    'hero.alt.linux': 'Debian/Ubuntu? Download the .deb package',
    'release.unknown': 'Latest release on GitHub',
    'release.info': 'Version {v} · released {date}',
    'f.photos.t': 'Photos & videos',
    'f.photos.d':
      'Camera roll with albums, favorites and smart albums. HEIC and videos play without extra codecs.',
    'f.messages.t': 'Messages',
    'f.messages.d': 'iMessage and SMS conversations with attachments, in a familiar chat layout.',
    'f.whatsapp.t': 'WhatsApp',
    'f.whatsapp.d': 'Private and group chats with sender names, photos, videos and voice notes.',
    'f.calls.t': 'Calls & voicemail',
    'f.calls.d': 'Full call history and voicemail recordings you can play and save.',
    'f.notes.t': 'Notes',
    'f.notes.d': 'Apple Notes with folders and rich text formatting preserved.',
    'f.memos.t': 'Voice Memos',
    'f.memos.d': 'Listen to and export your recordings.',
    'f.contacts.t': 'Contacts',
    'f.contacts.d': 'Your address book, used everywhere to show names instead of numbers.',
    'f.search.t': 'Global search',
    'f.search.d': 'Press Ctrl/⌘ + K to search messages, chats, notes and contacts at once.',
    'f.export.t': 'Export',
    'f.export.d':
      'Save conversations and data as PDF, HTML, CSV, TXT, JSON or vCard; copy original media files.',
    'f.encrypted.t': 'Encrypted backups',
    'f.encrypted.d': 'Unlock password-protected backups right in the app.',
    'f.ui.t': 'Light, dark, EN/TR',
    'f.ui.d': 'Follows your system theme; English and Turkish interface.',
    'f.platforms.t': 'Windows, macOS, Linux',
    'f.platforms.d': 'One app, the same features on every desktop platform.',
    'features.title': 'Everything in your backup, one click away',
    'features.subtitle':
      'A native-feeling desktop app for the data iPhone keeps in its local backups.',
    'shots.title': 'Screenshots',
    'shots.subtitle': 'Captured from the real app using a synthetic demo backup.',
    'shots.photos': 'AppleFileViewer showing a photo library with albums',
    'shots.backups': 'Backups found automatically — encrypted ones are marked',
    'shots.overview': 'Device and backup overview',
    'shots.messages': 'Message threads with attachments',
    'shots.notes': 'Notes with folders',
    'shots.search': 'Global search across the whole backup',
    'shots.unlock': 'Unlocking an encrypted backup',
    'lb.open': 'Open screenshot',
    'lb.close': 'Close',
    'lb.prev': 'Previous screenshot',
    'lb.next': 'Next screenshot',
    'lb.label': 'Screenshot viewer',
    'privacy.title': 'Private by design',
    'privacy.lead': 'Your backup contains your whole life. It never leaves your computer.',
    'privacy.p1': 'Works fully offline — no account, no cloud, no uploads.',
    'privacy.p2': 'No telemetry, analytics or tracking of any kind.',
    'privacy.p3': 'Read-only: your backup files are never modified.',
    'privacy.p4':
      'Decrypted data lives in a temporary folder and is wiped when you lock the backup or quit.',
    'privacy.p5': 'Open source under the MIT license — anyone can audit the code.',
    'enc.title': 'Encrypted backups supported',
    'enc.body':
      'If “Encrypt local backup” is on for your iPhone, the backup is protected with a password. AppleFileViewer can unlock it:',
    'enc.s1': 'Select the backup marked LOCKED.',
    'enc.s2': 'Enter the backup password you chose in iTunes, Finder or Apple Devices.',
    'enc.s3': 'Browse as usual. Lock it again (or quit) and the decrypted copy is deleted.',
    'enc.note':
      'The password is never stored. If you forgot it, nobody — including this app — can recover the backup.',
    'dl.title': 'Download',
    'dl.subtitle': 'Free for everyone. Pick the file for your computer.',
    'dl.winSetup': 'Windows installer',
    'dl.winPortable': 'Windows portable',
    'dl.winPortableSub': 'No installation · x64 · .exe',
    'dl.macArm': 'macOS — Apple Silicon',
    'dl.macIntel': 'macOS — Intel',
    'dl.appimage': 'Linux AppImage',
    'dl.appimageSub': 'Most distributions · x86_64',
    'dl.deb': 'Linux .deb',
    'dl.unsigned':
      'The app is not code-signed, so your system shows a warning the first time. See “First launch” below — it takes a few seconds.',
    'dl.allReleases': 'All releases & release notes',
    'first.title': 'First launch of an unsigned app',
    'first.subtitle':
      'Code-signing certificates cost money every year; this free app skips them. Here is how to open it safely.',
    'first.win1':
      'Run <code>AppleFileViewer-Windows-Setup.exe</code> (or the portable <code>.exe</code>).',
    'first.win2':
      'If <em>“Windows protected your PC”</em> (SmartScreen) appears, click <strong>More info</strong> → <strong>Run anyway</strong>.',
    'first.win3':
      'Backups are found automatically in <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> (iTunes) and <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code> (Apple Devices / Microsoft Store iTunes).',
    'first.mac1':
      'Open the <code>.dmg</code> and drag <strong>AppleFileViewer</strong> to <strong>Applications</strong>.',
    'first.mac2':
      'Open the app once. When macOS says it cannot verify the developer, go to <strong>System Settings → Privacy &amp; Security</strong>, scroll down and click <strong>Open Anyway</strong>.',
    'first.mac3':
      'Alternative (Terminal): <code>xattr -dr com.apple.quarantine /Applications/AppleFileViewer.app</code>',
    'first.mac4':
      'Give it <strong>Full Disk Access</strong> (System Settings → Privacy &amp; Security → Full Disk Access → add AppleFileViewer), otherwise macOS hides <code>~/Library/Application Support/MobileSync/Backup</code>.',
    'first.linux1':
      'AppImage: <code>chmod +x AppleFileViewer-Linux-x86_64.AppImage</code> and run it. On Ubuntu 22.04+ you may need <code>sudo apt install libfuse2</code>.',
    'first.linux2':
      'Debian/Ubuntu: <code>sudo apt install ./AppleFileViewer-Linux-amd64.deb</code>',
    'first.linux3':
      'Linux has no iTunes: copy a backup folder from a Windows PC or Mac, or create one with libimobiledevice (<code>idevicebackup2 backup --full ~/iPhoneBackup</code>), then choose the folder in the app.',
    'faq.title': 'Frequently asked questions',
    'faq.q1': 'Is it really free?',
    'faq.a1': 'Yes. It is open source under the MIT license: free to use, share and modify.',
    'faq.q2': 'Does it need my iPhone connected?',
    'faq.a2':
      'No. It reads the backup that is already on your computer. Make a fresh backup with iTunes, Finder or Apple Devices first if you want the latest data.',
    'faq.q3': 'Can it change or damage my backup?',
    'faq.a3': 'No. Everything is opened read-only; the app works on temporary copies.',
    'faq.q4': 'Where are my backups stored?',
    'faq.a4':
      'Windows: <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> or <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code>. macOS: <code>~/Library/Application Support/MobileSync/Backup</code>. You can also pick any folder, e.g. on an external drive.',
    'faq.q5': 'Why does my system warn me about the app?',
    'faq.a5':
      'The app is not signed with a paid certificate. The source code and build pipeline are public on GitHub; see “First launch” for how to open it.',
    'faq.q6': 'Does it send any data anywhere?',
    'faq.a6':
      'No. There is no telemetry. The only optional network access is checking GitHub for a newer version.',
    'faq.q7': 'Is this an Apple product?',
    'faq.a7': 'No. It is an independent project, not affiliated with or endorsed by Apple Inc.',
    'footer.license': 'MIT License',
    'footer.source': 'Source code on GitHub',
    'footer.trademark':
      'iPhone, iTunes and Finder are trademarks of Apple Inc. This project is not affiliated with Apple.',
  },

  tr: {
    'meta.title':
      'AppleFileViewer — Windows, macOS ve Linux için ücretsiz iPhone yedek görüntüleyici',
    'meta.description':
      'iPhone yedekleri için ücretsiz, açık kaynak ve tamamen çevrimdışı görüntüleyici: fotoğraflar, mesajlar, WhatsApp, aramalar, sesli mesajlar, notlar, ses kayıtları ve kişiler — şifreli yedekler dahil.',
    'a11y.skip': 'İçeriğe geç',
    'a11y.primaryNav': 'Ana menü',
    'a11y.language': 'Dil',
    'a11y.theme': 'Koyu modu aç/kapat',
    'nav.features': 'Özellikler',
    'nav.screenshots': 'Ekran görüntüleri',
    'nav.privacy': 'Gizlilik',
    'nav.install': 'Kurulum',
    'nav.faq': 'SSS',
    'hero.badge': 'Ücretsiz ve açık kaynak · Windows · macOS · Linux',
    'hero.title': 'iPhone yedekleriniz artık okunabilir.',
    'hero.subtitle':
      'AppleFileViewer; iTunes, Finder veya Apple Aygıtları’nın bilgisayarınıza kaydettiği yedekleri açar ve fotoğraflarınızı, mesajlarınızı, WhatsApp sohbetlerinizi, aramalarınızı, notlarınızı ve daha fazlasını gösterir — çevrimdışı, salt okunur ve ücretsiz.',
    'hero.downloadGeneric': 'İndir',
    'hero.downloadFor': '{os} için indir',
    'hero.otherPlatforms': 'Diğer platformlar',
    'hero.alt.windows': 'Kurulum istemiyor musunuz? Taşınabilir sürümü indirin',
    'hero.alt.macArm': 'Intel Mac mi? x64 sürümünü indirin',
    'hero.alt.macIntel': 'Apple Silicon Mac mi? arm64 sürümünü indirin',
    'hero.alt.linux': 'Debian/Ubuntu mu? .deb paketini indirin',
    'release.unknown': 'GitHub’daki son sürüm',
    'release.info': 'Sürüm {v} · {date} tarihinde yayınlandı',
    'f.photos.t': 'Fotoğraflar ve videolar',
    'f.photos.d':
      'Albümler, favoriler ve akıllı albümlerle film rulosu. HEIC ve videolar ek codec gerekmeden açılır.',
    'f.messages.t': 'Mesajlar',
    'f.messages.d':
      'iMessage ve SMS konuşmaları ekleriyle birlikte, tanıdık bir sohbet görünümünde.',
    'f.whatsapp.t': 'WhatsApp',
    'f.whatsapp.d':
      'Gönderen adlarıyla bireysel ve grup sohbetleri; fotoğraf, video ve sesli mesajlar.',
    'f.calls.t': 'Aramalar ve sesli mesaj',
    'f.calls.d': 'Tüm arama geçmişi ve dinleyip kaydedebileceğiniz sesli mesajlar.',
    'f.notes.t': 'Notlar',
    'f.notes.d': 'Klasörleri ve zengin metin biçimlendirmesiyle Apple Notlar.',
    'f.memos.t': 'Ses Kayıtları',
    'f.memos.d': 'Kayıtlarınızı dinleyin ve dışa aktarın.',
    'f.contacts.t': 'Kişiler',
    'f.contacts.d': 'Rehberiniz; her yerde numara yerine isim gösterilir.',
    'f.search.t': 'Genel arama',
    'f.search.d': 'Ctrl/⌘ + K ile mesajlarda, sohbetlerde, notlarda ve kişilerde aynı anda arayın.',
    'f.export.t': 'Dışa aktarma',
    'f.export.d':
      'Konuşmaları ve verileri PDF, HTML, CSV, TXT, JSON veya vCard olarak kaydedin; orijinal medyayı kopyalayın.',
    'f.encrypted.t': 'Şifreli yedekler',
    'f.encrypted.d': 'Parola korumalı yedeklerin kilidini doğrudan uygulamada açın.',
    'f.ui.t': 'Açık, koyu, TR/EN',
    'f.ui.d': 'Sistem temanızı izler; Türkçe ve İngilizce arayüz.',
    'f.platforms.t': 'Windows, macOS, Linux',
    'f.platforms.d': 'Tek uygulama, her masaüstü platformunda aynı özellikler.',
    'features.title': 'Yedeğinizdeki her şey bir tık uzağınızda',
    'features.subtitle':
      'iPhone’un yerel yedeklerinde tuttuğu veriler için yerel hissiyatlı bir masaüstü uygulaması.',
    'shots.title': 'Ekran görüntüleri',
    'shots.subtitle': 'Gerçek uygulamadan, yapay bir demo yedekle alınmıştır.',
    'shots.photos': 'AppleFileViewer’da albümlü fotoğraf kitaplığı',
    'shots.backups': 'Yedekler otomatik bulunur — şifreli olanlar işaretlenir',
    'shots.overview': 'Cihaz ve yedek özeti',
    'shots.messages': 'Ekleriyle mesaj konuşmaları',
    'shots.notes': 'Klasörleriyle notlar',
    'shots.search': 'Tüm yedekte genel arama',
    'shots.unlock': 'Şifreli bir yedeğin kilidini açma',
    'lb.open': 'Ekran görüntüsünü aç',
    'lb.close': 'Kapat',
    'lb.prev': 'Önceki ekran görüntüsü',
    'lb.next': 'Sonraki ekran görüntüsü',
    'lb.label': 'Ekran görüntüsü görüntüleyici',
    'privacy.title': 'Tasarımdan gelen gizlilik',
    'privacy.lead': 'Yedeğiniz tüm hayatınızı içerir. Bilgisayarınızdan asla çıkmaz.',
    'privacy.p1': 'Tamamen çevrimdışı çalışır — hesap yok, bulut yok, yükleme yok.',
    'privacy.p2': 'Hiçbir telemetri, analiz veya izleme yok.',
    'privacy.p3': 'Salt okunur: yedek dosyalarınız asla değiştirilmez.',
    'privacy.p4':
      'Çözülmüş veriler geçici bir klasörde tutulur; yedeği kilitlediğinizde veya çıktığınızda silinir.',
    'privacy.p5': 'MIT lisanslı açık kaynak — kodu herkes inceleyebilir.',
    'enc.title': 'Şifreli yedek desteği',
    'enc.body':
      'iPhone’unuzda “Yerel yedeği şifrele” açıksa yedek bir parolayla korunur. AppleFileViewer bu yedeğin kilidini açabilir:',
    'enc.s1': 'KİLİTLİ olarak işaretli yedeği seçin.',
    'enc.s2': 'iTunes, Finder veya Apple Aygıtları’nda belirlediğiniz yedek parolasını girin.',
    'enc.s3': 'Her zamanki gibi gezinin. Yeniden kilitleyin (veya çıkın), çözülmüş kopya silinir.',
    'enc.note':
      'Parola asla saklanmaz. Unuttuysanız yedeği hiç kimse — bu uygulama dahil — kurtaramaz.',
    'dl.title': 'İndir',
    'dl.subtitle': 'Herkes için ücretsiz. Bilgisayarınıza uygun dosyayı seçin.',
    'dl.winSetup': 'Windows kurulum programı',
    'dl.winPortable': 'Windows taşınabilir',
    'dl.winPortableSub': 'Kurulum gerektirmez · x64 · .exe',
    'dl.macArm': 'macOS — Apple Silicon',
    'dl.macIntel': 'macOS — Intel',
    'dl.appimage': 'Linux AppImage',
    'dl.appimageSub': 'Çoğu dağıtım · x86_64',
    'dl.deb': 'Linux .deb',
    'dl.unsigned':
      'Uygulama kod imzalı değildir; sisteminiz ilk açılışta uyarı gösterir. Aşağıdaki “İlk açılış” bölümüne bakın — birkaç saniye sürer.',
    'dl.allReleases': 'Tüm sürümler ve sürüm notları',
    'first.title': 'İmzasız bir uygulamanın ilk açılışı',
    'first.subtitle':
      'Kod imzalama sertifikaları her yıl ücretlidir; bu ücretsiz uygulama bunları kullanmaz. Güvenle açmak için:',
    'first.win1':
      '<code>AppleFileViewer-Windows-Setup.exe</code> dosyasını (veya taşınabilir <code>.exe</code>’yi) çalıştırın.',
    'first.win2':
      '<em>“Windows bilgisayarınızı korudu”</em> (SmartScreen) görünürse <strong>Ek bilgi</strong> → <strong>Yine de çalıştır</strong>’a tıklayın.',
    'first.win3':
      'Yedekler otomatik olarak <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> (iTunes) ve <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code> (Apple Aygıtları / Microsoft Store iTunes) klasörlerinde bulunur.',
    'first.mac1':
      '<code>.dmg</code> dosyasını açın ve <strong>AppleFileViewer</strong>’ı <strong>Uygulamalar</strong>’a sürükleyin.',
    'first.mac2':
      'Uygulamayı bir kez açın. macOS geliştiriciyi doğrulayamadığını söylerse <strong>Sistem Ayarları → Gizlilik ve Güvenlik</strong>’e gidin, aşağı kaydırın ve <strong>Yine de Aç</strong>’a tıklayın.',
    'first.mac3':
      'Alternatif (Terminal): <code>xattr -dr com.apple.quarantine /Applications/AppleFileViewer.app</code>',
    'first.mac4':
      '<strong>Tam Disk Erişimi</strong> verin (Sistem Ayarları → Gizlilik ve Güvenlik → Tam Disk Erişimi → AppleFileViewer’ı ekleyin); aksi halde macOS <code>~/Library/Application Support/MobileSync/Backup</code> klasörünü gizler.',
    'first.linux1':
      'AppImage: <code>chmod +x AppleFileViewer-Linux-x86_64.AppImage</code> komutunu verip çalıştırın. Ubuntu 22.04+ sürümlerinde <code>sudo apt install libfuse2</code> gerekebilir.',
    'first.linux2':
      'Debian/Ubuntu: <code>sudo apt install ./AppleFileViewer-Linux-amd64.deb</code>',
    'first.linux3':
      'Linux’ta iTunes yoktur: yedek klasörünü bir Windows PC’den veya Mac’ten kopyalayın ya da libimobiledevice ile oluşturun (<code>idevicebackup2 backup --full ~/iPhoneBackup</code>), ardından klasörü uygulamada seçin.',
    'faq.title': 'Sıkça sorulan sorular',
    'faq.q1': 'Gerçekten ücretsiz mi?',
    'faq.a1': 'Evet. MIT lisanslı açık kaynaktır: kullanmak, paylaşmak ve değiştirmek serbesttir.',
    'faq.q2': 'iPhone’umun bağlı olması gerekiyor mu?',
    'faq.a2':
      'Hayır. Bilgisayarınızda zaten bulunan yedeği okur. En güncel veriler için önce iTunes, Finder veya Apple Aygıtları ile yeni bir yedek alın.',
    'faq.q3': 'Yedeğimi değiştirebilir veya bozabilir mi?',
    'faq.a3': 'Hayır. Her şey salt okunur açılır; uygulama geçici kopyalarla çalışır.',
    'faq.q4': 'Yedeklerim nerede saklanıyor?',
    'faq.a4':
      'Windows: <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> veya <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code>. macOS: <code>~/Library/Application Support/MobileSync/Backup</code>. Harici disk gibi herhangi bir klasörü de seçebilirsiniz.',
    'faq.q5': 'Sistemim neden uygulama hakkında uyarı veriyor?',
    'faq.a5':
      'Uygulama ücretli bir sertifikayla imzalanmamıştır. Kaynak kodu ve derleme süreci GitHub’da herkese açıktır; nasıl açılacağı için “İlk açılış” bölümüne bakın.',
    'faq.q6': 'Herhangi bir yere veri gönderiyor mu?',
    'faq.a6':
      'Hayır. Telemetri yoktur. Tek isteğe bağlı ağ erişimi, GitHub’da yeni sürüm kontrolüdür.',
    'faq.q7': 'Bu bir Apple ürünü mü?',
    'faq.a7':
      'Hayır. Apple Inc. ile bağlantısı olmayan, onun tarafından onaylanmamış bağımsız bir projedir.',
    'footer.license': 'MIT Lisansı',
    'footer.source': 'GitHub’da kaynak kodu',
    'footer.trademark':
      'iPhone, iTunes ve Finder, Apple Inc.’in ticari markalarıdır. Bu proje Apple ile bağlantılı değildir.',
  },

  de: {
    'meta.title': 'AppleFileViewer — kostenloser iPhone-Backup-Viewer für Windows, macOS & Linux',
    'meta.description':
      'Kostenloser, quelloffener und komplett offline arbeitender Viewer für iPhone-Backups: Fotos, Nachrichten, WhatsApp, Anrufe, Voicemail, Notizen, Sprachmemos und Kontakte — auch verschlüsselte Backups.',
    'a11y.skip': 'Zum Inhalt springen',
    'a11y.primaryNav': 'Hauptnavigation',
    'a11y.language': 'Sprache',
    'a11y.theme': 'Dunkelmodus umschalten',
    'nav.features': 'Funktionen',
    'nav.screenshots': 'Screenshots',
    'nav.privacy': 'Datenschutz',
    'nav.install': 'Installation',
    'nav.faq': 'FAQ',
    'hero.badge': 'Kostenlos & Open Source · Windows · macOS · Linux',
    'hero.title': 'Deine iPhone-Backups — endlich lesbar.',
    'hero.subtitle':
      'AppleFileViewer öffnet die Backups, die iTunes, der Finder oder Apple Geräte auf deinem Computer speichern, und zeigt Fotos, Nachrichten, WhatsApp-Chats, Anrufe, Notizen und mehr — offline, schreibgeschützt und kostenlos.',
    'hero.downloadGeneric': 'Herunterladen',
    'hero.downloadFor': 'Für {os} herunterladen',
    'hero.otherPlatforms': 'Andere Plattformen',
    'hero.alt.windows': 'Ohne Installation? Portable Version herunterladen',
    'hero.alt.macArm': 'Intel-Mac? x64-Version herunterladen',
    'hero.alt.macIntel': 'Mac mit Apple Silicon? arm64-Version herunterladen',
    'hero.alt.linux': 'Debian/Ubuntu? .deb-Paket herunterladen',
    'release.unknown': 'Neueste Version auf GitHub',
    'release.info': 'Version {v} · veröffentlicht am {date}',
    'f.photos.t': 'Fotos & Videos',
    'f.photos.d':
      'Aufnahmen mit Alben, Favoriten und intelligenten Alben. HEIC und Videos ohne zusätzliche Codecs.',
    'f.messages.t': 'Nachrichten',
    'f.messages.d': 'iMessage- und SMS-Unterhaltungen mit Anhängen in vertrauter Chat-Ansicht.',
    'f.whatsapp.t': 'WhatsApp',
    'f.whatsapp.d':
      'Einzel- und Gruppenchats mit Absendernamen, Fotos, Videos und Sprachnachrichten.',
    'f.calls.t': 'Anrufe & Voicemail',
    'f.calls.d': 'Vollständige Anrufliste und Voicemail-Aufnahmen zum Abspielen und Speichern.',
    'f.notes.t': 'Notizen',
    'f.notes.d': 'Apple Notizen mit Ordnern und erhaltener Textformatierung.',
    'f.memos.t': 'Sprachmemos',
    'f.memos.d': 'Aufnahmen anhören und exportieren.',
    'f.contacts.t': 'Kontakte',
    'f.contacts.d': 'Dein Adressbuch — überall werden Namen statt Nummern angezeigt.',
    'f.search.t': 'Globale Suche',
    'f.search.d':
      'Mit Strg/⌘ + K Nachrichten, Chats, Notizen und Kontakte gleichzeitig durchsuchen.',
    'f.export.t': 'Export',
    'f.export.d':
      'Unterhaltungen und Daten als PDF, HTML, CSV, TXT, JSON oder vCard speichern; Originalmedien kopieren.',
    'f.encrypted.t': 'Verschlüsselte Backups',
    'f.encrypted.d': 'Passwortgeschützte Backups direkt in der App entsperren.',
    'f.ui.t': 'Hell, dunkel, EN/TR',
    'f.ui.d': 'Folgt dem Systemdesign; Oberfläche auf Englisch und Türkisch.',
    'f.platforms.t': 'Windows, macOS, Linux',
    'f.platforms.d': 'Eine App, dieselben Funktionen auf jeder Desktop-Plattform.',
    'features.title': 'Alles aus deinem Backup, nur einen Klick entfernt',
    'features.subtitle':
      'Eine Desktop-App für die Daten, die das iPhone in lokalen Backups speichert.',
    'shots.title': 'Screenshots',
    'shots.subtitle': 'Aufgenommen in der echten App mit einem synthetischen Demo-Backup.',
    'shots.photos': 'AppleFileViewer zeigt eine Fotomediathek mit Alben',
    'shots.backups': 'Backups werden automatisch gefunden — verschlüsselte sind markiert',
    'shots.overview': 'Geräte- und Backup-Übersicht',
    'shots.messages': 'Nachrichtenverläufe mit Anhängen',
    'shots.notes': 'Notizen mit Ordnern',
    'shots.search': 'Globale Suche im gesamten Backup',
    'shots.unlock': 'Entsperren eines verschlüsselten Backups',
    'lb.open': 'Screenshot öffnen',
    'lb.close': 'Schließen',
    'lb.prev': 'Vorheriger Screenshot',
    'lb.next': 'Nächster Screenshot',
    'lb.label': 'Screenshot-Ansicht',
    'privacy.title': 'Datenschutz von Grund auf',
    'privacy.lead': 'Dein Backup enthält dein ganzes Leben. Es verlässt nie deinen Computer.',
    'privacy.p1': 'Funktioniert komplett offline — kein Konto, keine Cloud, keine Uploads.',
    'privacy.p2': 'Keine Telemetrie, keine Analyse, kein Tracking.',
    'privacy.p3': 'Schreibgeschützt: Deine Backup-Dateien werden nie verändert.',
    'privacy.p4':
      'Entschlüsselte Daten liegen in einem temporären Ordner und werden beim Sperren des Backups oder Beenden gelöscht.',
    'privacy.p5': 'Open Source unter MIT-Lizenz — jeder kann den Code prüfen.',
    'enc.title': 'Verschlüsselte Backups werden unterstützt',
    'enc.body':
      'Ist „Lokales Backup verschlüsseln“ aktiviert, ist das Backup durch ein Passwort geschützt. AppleFileViewer kann es entsperren:',
    'enc.s1': 'Wähle das als GESPERRT markierte Backup.',
    'enc.s2':
      'Gib das Backup-Passwort ein, das du in iTunes, im Finder oder in Apple Geräte festgelegt hast.',
    'enc.s3':
      'Wie gewohnt durchsuchen. Erneut sperren (oder beenden) — die entschlüsselte Kopie wird gelöscht.',
    'enc.note':
      'Das Passwort wird nie gespeichert. Wenn du es vergessen hast, kann niemand — auch diese App nicht — das Backup wiederherstellen.',
    'dl.title': 'Download',
    'dl.subtitle': 'Kostenlos für alle. Wähle die passende Datei für deinen Computer.',
    'dl.winSetup': 'Windows-Installer',
    'dl.winPortable': 'Windows portabel',
    'dl.winPortableSub': 'Ohne Installation · x64 · .exe',
    'dl.macArm': 'macOS — Apple Silicon',
    'dl.macIntel': 'macOS — Intel',
    'dl.appimage': 'Linux AppImage',
    'dl.appimageSub': 'Die meisten Distributionen · x86_64',
    'dl.deb': 'Linux .deb',
    'dl.unsigned':
      'Die App ist nicht code-signiert, daher zeigt dein System beim ersten Start eine Warnung. Siehe „Erster Start“ unten — dauert nur Sekunden.',
    'dl.allReleases': 'Alle Versionen & Versionshinweise',
    'first.title': 'Erster Start einer unsignierten App',
    'first.subtitle':
      'Code-Signing-Zertifikate kosten jedes Jahr Geld; diese kostenlose App verzichtet darauf. So öffnest du sie sicher.',
    'first.win1':
      'Starte <code>AppleFileViewer-Windows-Setup.exe</code> (oder die portable <code>.exe</code>).',
    'first.win2':
      'Erscheint <em>„Der Computer wurde durch Windows geschützt“</em> (SmartScreen), klicke auf <strong>Weitere Informationen</strong> → <strong>Trotzdem ausführen</strong>.',
    'first.win3':
      'Backups werden automatisch in <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> (iTunes) und <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code> (Apple Geräte / iTunes aus dem Microsoft Store) gefunden.',
    'first.mac1':
      'Öffne die <code>.dmg</code> und ziehe <strong>AppleFileViewer</strong> in <strong>Programme</strong>.',
    'first.mac2':
      'Öffne die App einmal. Meldet macOS, dass der Entwickler nicht überprüft werden kann, gehe zu <strong>Systemeinstellungen → Datenschutz &amp; Sicherheit</strong>, scrolle nach unten und klicke auf <strong>Dennoch öffnen</strong>.',
    'first.mac3':
      'Alternativ (Terminal): <code>xattr -dr com.apple.quarantine /Applications/AppleFileViewer.app</code>',
    'first.mac4':
      'Gewähre <strong>Festplattenvollzugriff</strong> (Systemeinstellungen → Datenschutz &amp; Sicherheit → Festplattenvollzugriff → AppleFileViewer hinzufügen), sonst verbirgt macOS <code>~/Library/Application Support/MobileSync/Backup</code>.',
    'first.linux1':
      'AppImage: <code>chmod +x AppleFileViewer-Linux-x86_64.AppImage</code> ausführen und starten. Unter Ubuntu 22.04+ wird ggf. <code>sudo apt install libfuse2</code> benötigt.',
    'first.linux2':
      'Debian/Ubuntu: <code>sudo apt install ./AppleFileViewer-Linux-amd64.deb</code>',
    'first.linux3':
      'Unter Linux gibt es kein iTunes: Kopiere einen Backup-Ordner von einem Windows-PC oder Mac oder erstelle einen mit libimobiledevice (<code>idevicebackup2 backup --full ~/iPhoneBackup</code>) und wähle den Ordner in der App.',
    'faq.title': 'Häufige Fragen',
    'faq.q1': 'Ist es wirklich kostenlos?',
    'faq.a1': 'Ja. Open Source unter MIT-Lizenz: frei nutzbar, teilbar und veränderbar.',
    'faq.q2': 'Muss mein iPhone angeschlossen sein?',
    'faq.a2':
      'Nein. Die App liest das Backup, das bereits auf deinem Computer liegt. Für aktuelle Daten erstelle vorher ein neues Backup mit iTunes, dem Finder oder Apple Geräte.',
    'faq.q3': 'Kann die App mein Backup verändern oder beschädigen?',
    'faq.a3': 'Nein. Alles wird schreibgeschützt geöffnet; die App arbeitet mit temporären Kopien.',
    'faq.q4': 'Wo werden meine Backups gespeichert?',
    'faq.a4':
      'Windows: <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> oder <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code>. macOS: <code>~/Library/Application Support/MobileSync/Backup</code>. Du kannst auch jeden anderen Ordner wählen, z. B. auf einer externen Festplatte.',
    'faq.q5': 'Warum warnt mein System vor der App?',
    'faq.a5':
      'Die App ist nicht mit einem kostenpflichtigen Zertifikat signiert. Quellcode und Build-Pipeline sind öffentlich auf GitHub; unter „Erster Start“ steht, wie du sie öffnest.',
    'faq.q6': 'Sendet die App irgendwelche Daten?',
    'faq.a6':
      'Nein. Es gibt keine Telemetrie. Der einzige optionale Netzwerkzugriff ist die Prüfung auf eine neue Version bei GitHub.',
    'faq.q7': 'Ist das ein Apple-Produkt?',
    'faq.a7':
      'Nein. Es ist ein unabhängiges Projekt, nicht mit Apple Inc. verbunden oder von Apple unterstützt.',
    'footer.license': 'MIT-Lizenz',
    'footer.source': 'Quellcode auf GitHub',
    'footer.trademark':
      'iPhone, iTunes und Finder sind Marken der Apple Inc. Dieses Projekt steht in keiner Verbindung zu Apple.',
  },

  es: {
    'meta.title':
      'AppleFileViewer — visor gratuito de copias de seguridad de iPhone para Windows, macOS y Linux',
    'meta.description':
      'Visor gratuito, de código abierto y totalmente sin conexión para copias de seguridad de iPhone: fotos, mensajes, WhatsApp, llamadas, buzón de voz, notas, notas de voz y contactos, incluidas copias cifradas.',
    'a11y.skip': 'Ir al contenido',
    'a11y.primaryNav': 'Navegación principal',
    'a11y.language': 'Idioma',
    'a11y.theme': 'Cambiar modo oscuro',
    'nav.features': 'Funciones',
    'nav.screenshots': 'Capturas',
    'nav.privacy': 'Privacidad',
    'nav.install': 'Instalación',
    'nav.faq': 'Preguntas',
    'hero.badge': 'Gratis y de código abierto · Windows · macOS · Linux',
    'hero.title': 'Tus copias de seguridad del iPhone, por fin legibles.',
    'hero.subtitle':
      'AppleFileViewer abre las copias que iTunes, el Finder o Dispositivos Apple guardan en tu ordenador y muestra tus fotos, mensajes, chats de WhatsApp, llamadas, notas y más: sin conexión, solo lectura y gratis.',
    'hero.downloadGeneric': 'Descargar',
    'hero.downloadFor': 'Descargar para {os}',
    'hero.otherPlatforms': 'Otras plataformas',
    'hero.alt.windows': '¿Sin instalación? Descarga la versión portátil',
    'hero.alt.macArm': '¿Mac con Intel? Descarga la versión x64',
    'hero.alt.macIntel': '¿Mac con Apple Silicon? Descarga la versión arm64',
    'hero.alt.linux': '¿Debian/Ubuntu? Descarga el paquete .deb',
    'release.unknown': 'Última versión en GitHub',
    'release.info': 'Versión {v} · publicada el {date}',
    'f.photos.t': 'Fotos y vídeos',
    'f.photos.d':
      'Carrete con álbumes, favoritos y álbumes inteligentes. HEIC y vídeos sin códecs adicionales.',
    'f.messages.t': 'Mensajes',
    'f.messages.d': 'Conversaciones de iMessage y SMS con adjuntos, en una vista de chat familiar.',
    'f.whatsapp.t': 'WhatsApp',
    'f.whatsapp.d':
      'Chats individuales y de grupo con nombres de remitentes, fotos, vídeos y notas de voz.',
    'f.calls.t': 'Llamadas y buzón de voz',
    'f.calls.d':
      'Historial completo de llamadas y mensajes de voz que puedes reproducir y guardar.',
    'f.notes.t': 'Notas',
    'f.notes.d': 'Apple Notas con carpetas y formato de texto conservado.',
    'f.memos.t': 'Notas de voz',
    'f.memos.d': 'Escucha y exporta tus grabaciones.',
    'f.contacts.t': 'Contactos',
    'f.contacts.d': 'Tu agenda: en todas partes verás nombres en lugar de números.',
    'f.search.t': 'Búsqueda global',
    'f.search.d': 'Pulsa Ctrl/⌘ + K para buscar a la vez en mensajes, chats, notas y contactos.',
    'f.export.t': 'Exportar',
    'f.export.d':
      'Guarda conversaciones y datos como PDF, HTML, CSV, TXT, JSON o vCard; copia los archivos multimedia originales.',
    'f.encrypted.t': 'Copias cifradas',
    'f.encrypted.d': 'Desbloquea copias protegidas con contraseña directamente en la app.',
    'f.ui.t': 'Claro, oscuro, EN/TR',
    'f.ui.d': 'Sigue el tema del sistema; interfaz en inglés y turco.',
    'f.platforms.t': 'Windows, macOS, Linux',
    'f.platforms.d': 'Una sola app, las mismas funciones en todas las plataformas de escritorio.',
    'features.title': 'Todo lo de tu copia, a un clic',
    'features.subtitle':
      'Una app de escritorio para los datos que el iPhone guarda en sus copias locales.',
    'shots.title': 'Capturas de pantalla',
    'shots.subtitle': 'Tomadas de la app real con una copia de demostración sintética.',
    'shots.photos': 'AppleFileViewer mostrando una fototeca con álbumes',
    'shots.backups': 'Copias encontradas automáticamente; las cifradas aparecen marcadas',
    'shots.overview': 'Resumen del dispositivo y de la copia',
    'shots.messages': 'Conversaciones con adjuntos',
    'shots.notes': 'Notas con carpetas',
    'shots.search': 'Búsqueda global en toda la copia',
    'shots.unlock': 'Desbloqueo de una copia cifrada',
    'lb.open': 'Abrir captura',
    'lb.close': 'Cerrar',
    'lb.prev': 'Captura anterior',
    'lb.next': 'Captura siguiente',
    'lb.label': 'Visor de capturas',
    'privacy.title': 'Privacidad desde el diseño',
    'privacy.lead': 'Tu copia contiene toda tu vida. Nunca sale de tu ordenador.',
    'privacy.p1': 'Funciona totalmente sin conexión: sin cuenta, sin nube, sin subidas.',
    'privacy.p2': 'Sin telemetría, analíticas ni rastreo de ningún tipo.',
    'privacy.p3': 'Solo lectura: tus archivos de copia nunca se modifican.',
    'privacy.p4':
      'Los datos descifrados se guardan en una carpeta temporal y se borran al bloquear la copia o salir.',
    'privacy.p5': 'Código abierto con licencia MIT: cualquiera puede auditar el código.',
    'enc.title': 'Compatible con copias cifradas',
    'enc.body':
      'Si «Encriptar copia local» está activado en tu iPhone, la copia está protegida con contraseña. AppleFileViewer puede desbloquearla:',
    'enc.s1': 'Selecciona la copia marcada como BLOQUEADA.',
    'enc.s2':
      'Introduce la contraseña de copia que elegiste en iTunes, el Finder o Dispositivos Apple.',
    'enc.s3': 'Navega como siempre. Vuelve a bloquearla (o sal) y la copia descifrada se elimina.',
    'enc.note':
      'La contraseña nunca se guarda. Si la olvidaste, nadie —ni siquiera esta app— puede recuperar la copia.',
    'dl.title': 'Descargar',
    'dl.subtitle': 'Gratis para todos. Elige el archivo para tu ordenador.',
    'dl.winSetup': 'Instalador de Windows',
    'dl.winPortable': 'Windows portátil',
    'dl.winPortableSub': 'Sin instalación · x64 · .exe',
    'dl.macArm': 'macOS — Apple Silicon',
    'dl.macIntel': 'macOS — Intel',
    'dl.appimage': 'Linux AppImage',
    'dl.appimageSub': 'La mayoría de distribuciones · x86_64',
    'dl.deb': 'Linux .deb',
    'dl.unsigned':
      'La app no está firmada, así que tu sistema mostrará un aviso la primera vez. Consulta «Primer inicio» más abajo: solo lleva unos segundos.',
    'dl.allReleases': 'Todas las versiones y notas',
    'first.title': 'Primer inicio de una app sin firmar',
    'first.subtitle':
      'Los certificados de firma de código cuestan dinero cada año; esta app gratuita no los usa. Así puedes abrirla de forma segura.',
    'first.win1':
      'Ejecuta <code>AppleFileViewer-Windows-Setup.exe</code> (o el <code>.exe</code> portátil).',
    'first.win2':
      'Si aparece <em>«Windows protegió su PC»</em> (SmartScreen), haz clic en <strong>Más información</strong> → <strong>Ejecutar de todas formas</strong>.',
    'first.win3':
      'Las copias se encuentran automáticamente en <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> (iTunes) y <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code> (Dispositivos Apple / iTunes de Microsoft Store).',
    'first.mac1':
      'Abre el <code>.dmg</code> y arrastra <strong>AppleFileViewer</strong> a <strong>Aplicaciones</strong>.',
    'first.mac2':
      'Abre la app una vez. Si macOS indica que no puede verificar al desarrollador, ve a <strong>Ajustes del Sistema → Privacidad y seguridad</strong>, desplázate hacia abajo y pulsa <strong>Abrir igualmente</strong>.',
    'first.mac3':
      'Alternativa (Terminal): <code>xattr -dr com.apple.quarantine /Applications/AppleFileViewer.app</code>',
    'first.mac4':
      'Concede <strong>Acceso total al disco</strong> (Ajustes del Sistema → Privacidad y seguridad → Acceso total al disco → añade AppleFileViewer); si no, macOS oculta <code>~/Library/Application Support/MobileSync/Backup</code>.',
    'first.linux1':
      'AppImage: ejecuta <code>chmod +x AppleFileViewer-Linux-x86_64.AppImage</code> y ábrelo. En Ubuntu 22.04+ puede que necesites <code>sudo apt install libfuse2</code>.',
    'first.linux2':
      'Debian/Ubuntu: <code>sudo apt install ./AppleFileViewer-Linux-amd64.deb</code>',
    'first.linux3':
      'Linux no tiene iTunes: copia una carpeta de copia desde un PC con Windows o un Mac, o crea una con libimobiledevice (<code>idevicebackup2 backup --full ~/iPhoneBackup</code>) y elige la carpeta en la app.',
    'faq.title': 'Preguntas frecuentes',
    'faq.q1': '¿De verdad es gratis?',
    'faq.a1': 'Sí. Es código abierto con licencia MIT: libre para usar, compartir y modificar.',
    'faq.q2': '¿Necesito conectar el iPhone?',
    'faq.a2':
      'No. Lee la copia que ya está en tu ordenador. Si quieres los datos más recientes, haz antes una copia nueva con iTunes, el Finder o Dispositivos Apple.',
    'faq.q3': '¿Puede modificar o dañar mi copia?',
    'faq.a3': 'No. Todo se abre en modo solo lectura; la app trabaja con copias temporales.',
    'faq.q4': '¿Dónde se guardan mis copias?',
    'faq.a4':
      'Windows: <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> o <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code>. macOS: <code>~/Library/Application Support/MobileSync/Backup</code>. También puedes elegir cualquier carpeta, por ejemplo en un disco externo.',
    'faq.q5': '¿Por qué mi sistema muestra una advertencia?',
    'faq.a5':
      'La app no está firmada con un certificado de pago. El código fuente y el proceso de compilación son públicos en GitHub; consulta «Primer inicio» para abrirla.',
    'faq.q6': '¿Envía datos a algún sitio?',
    'faq.a6':
      'No. No hay telemetría. El único acceso a la red, opcional, es comprobar en GitHub si hay una versión nueva.',
    'faq.q7': '¿Es un producto de Apple?',
    'faq.a7': 'No. Es un proyecto independiente, no afiliado ni respaldado por Apple Inc.',
    'footer.license': 'Licencia MIT',
    'footer.source': 'Código fuente en GitHub',
    'footer.trademark':
      'iPhone, iTunes y Finder son marcas comerciales de Apple Inc. Este proyecto no está afiliado a Apple.',
  },

  fr: {
    'meta.title':
      'AppleFileViewer — visionneuse gratuite de sauvegardes iPhone pour Windows, macOS et Linux',
    'meta.description':
      'Visionneuse gratuite, open source et entièrement hors ligne pour les sauvegardes iPhone : photos, messages, WhatsApp, appels, messagerie vocale, notes, mémos vocaux et contacts — sauvegardes chiffrées comprises.',
    'a11y.skip': 'Aller au contenu',
    'a11y.primaryNav': 'Navigation principale',
    'a11y.language': 'Langue',
    'a11y.theme': 'Basculer le mode sombre',
    'nav.features': 'Fonctions',
    'nav.screenshots': 'Captures',
    'nav.privacy': 'Confidentialité',
    'nav.install': 'Installation',
    'nav.faq': 'FAQ',
    'hero.badge': 'Gratuit et open source · Windows · macOS · Linux',
    'hero.title': 'Vos sauvegardes iPhone, enfin lisibles.',
    'hero.subtitle':
      'AppleFileViewer ouvre les sauvegardes qu’iTunes, le Finder ou Appareils Apple enregistrent sur votre ordinateur et affiche vos photos, messages, discussions WhatsApp, appels, notes et plus encore — hors ligne, en lecture seule et gratuitement.',
    'hero.downloadGeneric': 'Télécharger',
    'hero.downloadFor': 'Télécharger pour {os}',
    'hero.otherPlatforms': 'Autres plateformes',
    'hero.alt.windows': 'Sans installation ? Téléchargez la version portable',
    'hero.alt.macArm': 'Mac Intel ? Téléchargez la version x64',
    'hero.alt.macIntel': 'Mac Apple Silicon ? Téléchargez la version arm64',
    'hero.alt.linux': 'Debian/Ubuntu ? Téléchargez le paquet .deb',
    'release.unknown': 'Dernière version sur GitHub',
    'release.info': 'Version {v} · publiée le {date}',
    'f.photos.t': 'Photos et vidéos',
    'f.photos.d':
      'Pellicule avec albums, favoris et albums intelligents. HEIC et vidéos sans codec supplémentaire.',
    'f.messages.t': 'Messages',
    'f.messages.d':
      'Conversations iMessage et SMS avec pièces jointes, dans une vue de discussion familière.',
    'f.whatsapp.t': 'WhatsApp',
    'f.whatsapp.d':
      'Discussions privées et de groupe avec noms des expéditeurs, photos, vidéos et messages vocaux.',
    'f.calls.t': 'Appels et messagerie vocale',
    'f.calls.d': 'Historique complet des appels et messages vocaux à écouter et enregistrer.',
    'f.notes.t': 'Notes',
    'f.notes.d': 'Apple Notes avec dossiers et mise en forme conservée.',
    'f.memos.t': 'Dictaphone',
    'f.memos.d': 'Écoutez et exportez vos enregistrements.',
    'f.contacts.t': 'Contacts',
    'f.contacts.d': 'Votre carnet d’adresses : des noms plutôt que des numéros, partout.',
    'f.search.t': 'Recherche globale',
    'f.search.d':
      'Ctrl/⌘ + K pour chercher à la fois dans les messages, discussions, notes et contacts.',
    'f.export.t': 'Export',
    'f.export.d':
      'Enregistrez conversations et données en PDF, HTML, CSV, TXT, JSON ou vCard ; copiez les fichiers multimédias d’origine.',
    'f.encrypted.t': 'Sauvegardes chiffrées',
    'f.encrypted.d':
      'Déverrouillez les sauvegardes protégées par mot de passe directement dans l’app.',
    'f.ui.t': 'Clair, sombre, EN/TR',
    'f.ui.d': 'Suit le thème du système ; interface en anglais et en turc.',
    'f.platforms.t': 'Windows, macOS, Linux',
    'f.platforms.d': 'Une seule app, les mêmes fonctions sur tous les systèmes de bureau.',
    'features.title': 'Tout le contenu de votre sauvegarde, en un clic',
    'features.subtitle':
      'Une app de bureau pour les données que l’iPhone conserve dans ses sauvegardes locales.',
    'shots.title': 'Captures d’écran',
    'shots.subtitle': 'Prises dans la vraie app avec une sauvegarde de démonstration synthétique.',
    'shots.photos': 'AppleFileViewer affichant une photothèque avec albums',
    'shots.backups': 'Sauvegardes détectées automatiquement — les chiffrées sont signalées',
    'shots.overview': 'Vue d’ensemble de l’appareil et de la sauvegarde',
    'shots.messages': 'Conversations avec pièces jointes',
    'shots.notes': 'Notes avec dossiers',
    'shots.search': 'Recherche globale dans toute la sauvegarde',
    'shots.unlock': 'Déverrouillage d’une sauvegarde chiffrée',
    'lb.open': 'Ouvrir la capture',
    'lb.close': 'Fermer',
    'lb.prev': 'Capture précédente',
    'lb.next': 'Capture suivante',
    'lb.label': 'Visionneuse de captures',
    'privacy.title': 'Confidentialité dès la conception',
    'privacy.lead':
      'Votre sauvegarde contient toute votre vie. Elle ne quitte jamais votre ordinateur.',
    'privacy.p1': 'Fonctionne entièrement hors ligne — pas de compte, pas de cloud, aucun envoi.',
    'privacy.p2': 'Aucune télémétrie, statistique ou pistage.',
    'privacy.p3': 'Lecture seule : vos fichiers de sauvegarde ne sont jamais modifiés.',
    'privacy.p4':
      'Les données déchiffrées résident dans un dossier temporaire et sont effacées au verrouillage de la sauvegarde ou à la fermeture.',
    'privacy.p5': 'Open source sous licence MIT — chacun peut auditer le code.',
    'enc.title': 'Sauvegardes chiffrées prises en charge',
    'enc.body':
      'Si « Chiffrer la sauvegarde locale » est activé, la sauvegarde est protégée par un mot de passe. AppleFileViewer peut la déverrouiller :',
    'enc.s1': 'Sélectionnez la sauvegarde marquée VERROUILLÉE.',
    'enc.s2':
      'Saisissez le mot de passe de sauvegarde choisi dans iTunes, le Finder ou Appareils Apple.',
    'enc.s3':
      'Naviguez normalement. Reverrouillez (ou quittez) et la copie déchiffrée est supprimée.',
    'enc.note':
      'Le mot de passe n’est jamais enregistré. Si vous l’avez oublié, personne — pas même cette app — ne peut récupérer la sauvegarde.',
    'dl.title': 'Télécharger',
    'dl.subtitle': 'Gratuit pour tous. Choisissez le fichier adapté à votre ordinateur.',
    'dl.winSetup': 'Programme d’installation Windows',
    'dl.winPortable': 'Windows portable',
    'dl.winPortableSub': 'Sans installation · x64 · .exe',
    'dl.macArm': 'macOS — Apple Silicon',
    'dl.macIntel': 'macOS — Intel',
    'dl.appimage': 'Linux AppImage',
    'dl.appimageSub': 'La plupart des distributions · x86_64',
    'dl.deb': 'Linux .deb',
    'dl.unsigned':
      'L’app n’est pas signée : votre système affichera un avertissement au premier lancement. Voir « Premier lancement » ci-dessous — quelques secondes suffisent.',
    'dl.allReleases': 'Toutes les versions et notes de version',
    'first.title': 'Premier lancement d’une app non signée',
    'first.subtitle':
      'Les certificats de signature coûtent de l’argent chaque année ; cette app gratuite s’en passe. Voici comment l’ouvrir en toute sécurité.',
    'first.win1':
      'Lancez <code>AppleFileViewer-Windows-Setup.exe</code> (ou le <code>.exe</code> portable).',
    'first.win2':
      'Si <em>« Windows a protégé votre ordinateur »</em> (SmartScreen) s’affiche, cliquez sur <strong>Informations complémentaires</strong> → <strong>Exécuter quand même</strong>.',
    'first.win3':
      'Les sauvegardes sont trouvées automatiquement dans <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> (iTunes) et <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code> (Appareils Apple / iTunes du Microsoft Store).',
    'first.mac1':
      'Ouvrez le <code>.dmg</code> et faites glisser <strong>AppleFileViewer</strong> dans <strong>Applications</strong>.',
    'first.mac2':
      'Ouvrez l’app une fois. Si macOS indique qu’il ne peut pas vérifier le développeur, allez dans <strong>Réglages Système → Confidentialité et sécurité</strong>, faites défiler et cliquez sur <strong>Ouvrir quand même</strong>.',
    'first.mac3':
      'Alternative (Terminal) : <code>xattr -dr com.apple.quarantine /Applications/AppleFileViewer.app</code>',
    'first.mac4':
      'Accordez l’<strong>accès complet au disque</strong> (Réglages Système → Confidentialité et sécurité → Accès complet au disque → ajoutez AppleFileViewer), sinon macOS masque <code>~/Library/Application Support/MobileSync/Backup</code>.',
    'first.linux1':
      'AppImage : <code>chmod +x AppleFileViewer-Linux-x86_64.AppImage</code> puis lancez-le. Sous Ubuntu 22.04+, <code>sudo apt install libfuse2</code> peut être nécessaire.',
    'first.linux2':
      'Debian/Ubuntu : <code>sudo apt install ./AppleFileViewer-Linux-amd64.deb</code>',
    'first.linux3':
      'Linux n’a pas iTunes : copiez un dossier de sauvegarde depuis un PC Windows ou un Mac, ou créez-en un avec libimobiledevice (<code>idevicebackup2 backup --full ~/iPhoneBackup</code>), puis choisissez le dossier dans l’app.',
    'faq.title': 'Questions fréquentes',
    'faq.q1': 'Est-ce vraiment gratuit ?',
    'faq.a1': 'Oui. Open source sous licence MIT : libre d’utiliser, de partager et de modifier.',
    'faq.q2': 'Mon iPhone doit-il être branché ?',
    'faq.a2':
      'Non. L’app lit la sauvegarde déjà présente sur votre ordinateur. Pour les données les plus récentes, faites d’abord une nouvelle sauvegarde avec iTunes, le Finder ou Appareils Apple.',
    'faq.q3': 'Peut-elle modifier ou endommager ma sauvegarde ?',
    'faq.a3': 'Non. Tout est ouvert en lecture seule ; l’app travaille sur des copies temporaires.',
    'faq.q4': 'Où sont stockées mes sauvegardes ?',
    'faq.a4':
      'Windows : <code>%APPDATA%\\Apple Computer\\MobileSync\\Backup</code> ou <code>%USERPROFILE%\\Apple\\MobileSync\\Backup</code>. macOS : <code>~/Library/Application Support/MobileSync/Backup</code>. Vous pouvez aussi choisir n’importe quel dossier, par exemple sur un disque externe.',
    'faq.q5': 'Pourquoi mon système affiche-t-il un avertissement ?',
    'faq.a5':
      'L’app n’est pas signée avec un certificat payant. Le code source et la chaîne de compilation sont publics sur GitHub ; voir « Premier lancement » pour l’ouvrir.',
    'faq.q6': 'Envoie-t-elle des données quelque part ?',
    'faq.a6':
      'Non. Aucune télémétrie. Le seul accès réseau, facultatif, consiste à vérifier sur GitHub si une nouvelle version existe.',
    'faq.q7': 'Est-ce un produit Apple ?',
    'faq.a7': 'Non. C’est un projet indépendant, ni affilié à Apple Inc. ni approuvé par elle.',
    'footer.license': 'Licence MIT',
    'footer.source': 'Code source sur GitHub',
    'footer.trademark':
      'iPhone, iTunes et Finder sont des marques d’Apple Inc. Ce projet n’est pas affilié à Apple.',
  },
};
