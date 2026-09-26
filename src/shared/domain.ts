/**
 * Yedeğin bulunduğu kökün türü:
 *  - itunes: Windows klasik iTunes (%APPDATA%\Apple Computer\MobileSync\Backup)
 *  - appleDevices: Windows Microsoft Store iTunes / Apple Devices (%USERPROFILE%\Apple\MobileSync\Backup)
 *  - finder: macOS (~/Library/Application Support/MobileSync/Backup)
 *  - env: AFV_BACKUP_DIR ortam değişkeni
 *  - override: kullanıcının seçtiği klasör
 */
export type BackupRootSource = 'itunes' | 'appleDevices' | 'finder' | 'env' | 'override';

/** Kök erişim durumu — permissionDenied: EPERM/EACCES (macOS'ta Tam Disk Erişimi yok). */
export type BackupRootState = 'ok' | 'missing' | 'permissionDenied' | 'error';

export interface BackupRootInfo {
  path: string;
  source: BackupRootSource;
  state: BackupRootState;
}

export interface BackupSummary {
  udid: string;
  rootPath: string;
  source: BackupRootSource;
  deviceName: string | null;
  productType: string | null;
  productName: string | null;
  productVersion: string | null;
  isEncrypted: boolean;
  /**
   * Manifest.plist okunamadı/parse edilemedi → şifreleme durumu BİLİNMİYOR.
   * Guard/protokol bunu şifreli gibi ele alır (fail closed) — yedek açılamaz.
   */
  encryptionUnknown: boolean;
  /**
   * Şifreli yedeğin kilidi bu oturumda açık mı (backup:unlock). Şifresiz yedekte
   * anlamsız (false/undefined). Yalnız main'in bellek-içi oturum kaydından gelir.
   */
  unlocked?: boolean;
  lastBackupDate: string | null;
  totalSizeBytes: number | null;
  parseError: string | null;
}

export interface BackupDetails extends BackupSummary {
  serialNumber: string | null;
  buildVersion: string | null;
  /** Info.plist "Installed Applications" — bundle ID listesi (eski yedeklerde boş). */
  installedApps: string[];
  /** Info.plist "IMEI" — hücresel olmayan cihazlarda / eski yedeklerde null. */
  imei: string | null;
  /** Info.plist "Phone Number" — yoksa null. */
  phoneNumber: string | null;
}

export interface ScanResult {
  /** Taranan tüm kökler (varsayılanlar + varsa override) ve erişim durumları. */
  roots: BackupRootInfo[];
  overridePath: string | null;
  overridePathAccessible: boolean;
  /** macOS: bir kök EPERM/EACCES verdi → Tam Disk Erişimi izni gerekli. */
  fullDiskAccessRequired: boolean;
  backups: BackupSummary[];
  errors: string[];
}

export interface PhotoMeta {
  fileId: string; // computeFileId(CameraRollDomain, relativePath)
  relativePath: string; // Media/ZDIRECTORY/ZFILENAME
  filename: string; // ZFILENAME
  ext: string; // 'HEIC' | 'JPG' | 'JPEG' | 'PNG' | 'MOV' | 'MP4' (uppercase)
  isVideo: boolean; // ZKIND === 1
  dateTakenIso: string | null; // ZDATECREATED → appleSecondsToDate → ISO
  isFavorite: boolean; // ZFAVORITE === 1
  isHidden: boolean; // ZHIDDEN === 1
  width: number | null; // ZWIDTH
  height: number | null; // ZHEIGHT
  durationSec: number | null; // ZDURATION (video)
  uti: string | null; // ZUNIFORMTYPEIDENTIFIER
  /** ZLATITUDE/ZLONGITUDE — konum yoksa (iOS -180 sentinel) veya kolon yoksa null. */
  latitude?: number | null;
  longitude?: number | null;
}

/** ZASSET kolonlarından türetilen akıllı albümler (şemada kolon varsa listelenir). */
export type PhotoSmartAlbumKey =
  | 'videos'
  | 'screenshots'
  | 'selfies'
  | 'livePhotos'
  | 'panoramas'
  | 'recentlyDeleted';

export interface PhotoAlbum {
  /** 'album:<Z_PK>' (kullanıcı albümü) | 'smart:<key>' — PhotosRequest.albumId'ye aynen geçilir. */
  id: string;
  kind: 'user' | 'smart';
  /** Kullanıcı albümü başlığı (ZTITLE); akıllı albümde null — renderer smartKey'den çevirir. */
  title: string | null;
  smartKey?: PhotoSmartAlbumKey;
  /** Aktif gizli-filtresi altında albümdeki medya sayısı. */
  count: number;
}

export interface PhotoAlbumsRequest {
  udid: string;
  rootPath: string;
  includeHidden?: boolean;
}

export interface PhotosResult {
  items: PhotoMeta[];
  /** Filtreye uyan TOPLAM kayıt sayısı (sayfa değil) — sonsuz scroll hasMore hesabı için. */
  total: number;
  /** Bu sayfanın başlangıç offset'i (istekten yankı). */
  offset: number;
}

export interface PhotosRequest {
  udid: string;
  rootPath: string;
  /**
   * Sayfalama: limit verilmezse TÜM kayıtlar döner (geriye uyumluluk).
   * Büyük yedeklerde renderer sayfa sayfa ister — ilk boyama hızlı,
   * IPC yükü küçük kalır (düşük donanım hedefi).
   */
  offset?: number;
  limit?: number;
  /** Server-side filtre — sayfalar filtre altında tutarlı kalsın diye SQL'de uygulanır. */
  favoritesOnly?: boolean;
  includeHidden?: boolean;
  /** PhotoAlbum.id — verilirse sonuç o albümle sınırlanır (SQL'de, sayfalama tutarlı). */
  albumId?: string;
}

// ── Global Arama (komut paleti) ────────────────────────────────────────────

export type SearchDomain =
  | 'messages'
  | 'whatsapp'
  | 'notes'
  | 'contacts'
  | 'calls'
  | 'voicemail'
  | 'voicememos'
  | 'photos';

export interface SearchHit {
  domain: SearchDomain;
  /** Sohbet adı / kişi adı / not başlığı. */
  title: string;
  /** Eşleşme çevresinden kısa kesit. */
  snippet: string;
  /** snippet içindeki eşleşme aralığı (vurgulama için; yoksa title'da eşleşmiştir). */
  snippetMatch?: { start: number; length: number };
  /** title içindeki eşleşme aralığı (vurgulama için). */
  titleMatch?: { start: number; length: number };
  dateIso: string | null;
  // Navigasyon hedefi — domain'e göre biri dolu
  chatId?: number; // messages → /messages/:udid?chat=
  sessionId?: number; // whatsapp
  noteId?: number; // notes
  contactId?: number; // contacts
  /** calls/voicemail/voicememos → satır id'si; photos → fileId. */
  itemId?: number | string;
}

export interface GlobalSearchRequest {
  udid: string;
  rootPath: string;
  query: string;
  /** Domain başına en fazla sonuç (varsayılan 10). */
  limitPerDomain?: number;
}

export interface GlobalSearchResult {
  hits: SearchHit[];
  tookMs: number;
  /** Hata veren domain'ler — diğerlerinin sonuçları yine döner (kısmi sonuç). */
  failedDomains?: SearchDomain[];
}

// ── Messages (SMS / iMessage) ──────────────────────────────────────────────

export type MessageService = 'iMessage' | 'SMS';

export interface Conversation {
  chatId: number; // chat.ROWID
  displayName: string; // chat.display_name || chat.chat_identifier (kişi adı resolve edilmiş)
  identifier: string; // chat.chat_identifier (ham — numara/handle)
  contactName: string | null; // AddressBook lookup sonucu (varsa)
  lastMessagePreview: string; // son mesaj snippet (boşsa "" )
  lastMessageDateIso: string | null; // son mesaj tarihi (appleNanosToDate → ISO)
  dominantService: MessageService; // sohbetin baskın service'i
  messageCount: number;
}

export interface Attachment {
  fileId: string | null; // computeFileId(MediaDomain, relPath) — çözülemezse null
  filename: string; // ham attachment.filename (ekran/log için)
  mimeType: string | null; // attachment.mime_type
  kind: 'image' | 'video' | 'audio' | 'file'; // mime'den türetilen render tipi
}

export interface Message {
  rowId: number; // message.ROWID
  text: string | null; // message.text
  service: MessageService;
  isFromMe: boolean; // message.is_from_me === 1
  dateIso: string | null; // message.date → appleNanosToDate → ISO
  handle: string | null; // handle.id (numara/email) — gelen mesajlarda dolu
  contactName: string | null; // AddressBook lookup (varsa)
  attachments: Attachment[];
  isStarred?: boolean; // ileride — şu an her zaman false
}

export interface MessagesConversationsRequest {
  udid: string;
  rootPath: string;
}

/**
 * Thread sayfalama imleci — keyset (date + ROWID). Offset yerine imleç:
 * büyük sohbetlerde OFFSET taraması yok, sayfalar kararlı.
 * dateNs BigInt hassasiyeti string olarak taşınır (IPC structured clone güvenli).
 */
export interface ThreadCursor {
  dateNs: string;
  rowId: number;
}

export interface MessagesThreadRequest {
  udid: string;
  rootPath: string;
  chatId: number;
  /**
   * EN YENİ `limit` mesaj döner; `before` imleci ile daha eskiler sayfa sayfa
   * çekilir (yukarı kaydırınca yükleme). Verilmezse varsayılan sayfa boyutu —
   * sınırsız sorgu YOK (tam sohbet export'u main'de sayfa sayfa toplanır).
   */
  limit?: number;
  before?: ThreadCursor | null;
}

export interface MessagesThreadResult {
  items: Message[];
  total: number;
  /** Daha eski mesaj sayfası varsa imleç; yoksa null. */
  nextBefore?: ThreadCursor | null;
}

// ── WhatsApp (ChatStorage.sqlite) ──────────────────────────────────────────

export interface WaConversation {
  sessionId: number; // ZWACHATSESSION.Z_PK
  displayName: string; // ZPARTNERNAME || kişi adı || JID numara
  contactJid: string; // ZCONTACTJID (numara@s.whatsapp.net veya grup@g.us)
  contactName: string | null; // AddressBook lookup (varsa)
  isGroup: boolean; // JID g.us ile bitiyorsa grup
  lastMessagePreview: string; // son mesaj snippet
  lastMessageDateIso: string | null; // son mesaj tarihi (appleSecondsToDate → ISO)
  messageCount: number;
}

export interface WaMedia {
  fileId: string | null; // computeFileId(AppDomainGroup..shared, relPath) — çözülemezse null
  localPath: string; // ham ZMEDIALOCALPATH (ekran/log için)
  mimeType: string | null; // ZWAMEDIAITEM.ZVCARDSTRING/ZTITLE yok → messageType'tan türet
  kind: 'image' | 'video' | 'audio' | 'file'; // render tipi
  title: string | null; // ZWAMEDIAITEM.ZTITLE (document dosya adı) — yoksa null
  isThumbnailOnly: boolean; // full media (ZMEDIALOCALPATH) yok, sadece ZXMPPTHUMBPATH küçük resmi
}

export interface WaMessage {
  messageId: number; // ZWAMESSAGE.Z_PK
  text: string | null; // ZTEXT
  isFromMe: boolean; // ZISFROMME === 1
  dateIso: string | null; // ZMESSAGEDATE → appleSecondsToDate → ISO (SANİYE!)
  fromJid: string | null; // ZFROMJID (gelen mesajlarda gönderen JID)
  senderName: string | null; // grup mesajında gönderen adı (ZPUSHNAME / üye adı)
  messageType: number | null; // ZMESSAGETYPE (sistem mesajı tespiti: 6/10/15 vb.)
  media: WaMedia | null;
}

export interface WaConversationsRequest {
  udid: string;
  rootPath: string;
}

/** WhatsApp keyset imleci — ZMESSAGEDATE (saniye, REAL) + Z_PK eşitlik kırıcı. */
export interface WaThreadCursor {
  date: number;
  messageId: number;
}

export interface WaThreadRequest {
  udid: string;
  rootPath: string;
  sessionId: number;
  /**
   * Sayfa boyutu — EN YENİ `limit` mesaj döner; `before` imleci ile daha eskiler
   * sayfa sayfa çekilir. Verilmezse varsayılan sayfa boyutu (sınırsız sorgu YOK).
   */
  limit?: number;
  before?: WaThreadCursor | null;
}

export interface WaThreadResult {
  items: WaMessage[];
  total: number;
  /** Daha eski mesaj sayfası varsa imleç; yoksa null. */
  nextBefore?: WaThreadCursor | null;
}

// ── Calls (CallHistory.storedata) ──────────────────────────────────────────

export type CallDirection = 'incoming' | 'outgoing';
export type CallType = 'phone' | 'facetime-video' | 'facetime-audio';

export interface CallRecord {
  id: number; // ZCALLRECORD.Z_PK
  dateIso: string | null; // ZDATE → appleSecondsToDate → ISO (SANİYE!)
  durationSec: number; // ZDURATION (saniye)
  direction: CallDirection; // ZORIGINATED === 1 → outgoing, else incoming
  isMissed: boolean; // ZANSWERED === 0 (cevapsız)
  callType: CallType; // ZCALLTYPE: 1 → phone, 8 → facetime-video, 16 → facetime-audio
  number: string; // ZADDRESS (BLOB/TEXT → numara)
  contactName: string | null; // AddressBook lookup (varsa)
}

export interface CallsRequest {
  udid: string;
  rootPath: string;
}

// ── Voicemail (HomeDomain/Library/Voicemail/voicemail.db) ───────────────────
// DİKKAT: voicemail.date UNIX epoch SANİYE (1970 tabanı) — Apple epoch DEĞİL!
// new Date(date*1000), appleSecondsToDate KULLANILMAZ.

export interface Voicemail {
  id: number; // voicemail.ROWID
  dateIso: string | null; // date (UNIX saniye) → new Date(date*1000).toISOString()
  durationSec: number; // duration (saniye)
  sender: string; // sender (numara)
  contactName: string | null; // AddressBook lookup (varsa)
  fileId: string; // computeFileId('HomeDomain', `Library/Voicemail/${ROWID}.amr`)
  isUnplayed: boolean; // flags & 1 — okunmamış/oynatılmamış
}

export interface VoicemailRequest {
  udid: string;
  rootPath: string;
}

// ── Notes (NoteStore.sqlite — gzip+protobuf) ────────────────────────────────
// AppDomainGroup-group.com.apple.notes / NoteStore.sqlite.
// ZICNOTEDATA.ZDATA = gzip(protobuf). gunzip → protobuf walk (field 2>3>2 noteText).
// Tarihler: ZCREATIONDATE/ZMODIFICATIONDATE Apple epoch SANİYE (FLOAT) → appleSecondsToDate.

/**
 * Not gövdesi biçim aralığı (Apple Notes attributeRun).
 * start/length UTF-16 code unit — JS string index'iyle birebir.
 */
export interface NoteRun {
  start: number;
  length: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  /** 0 title, 1 heading, 2 subheading, 4 mono, 100 bullet, 101 dash, 102 numbered, 103 checklist. */
  styleType: number | null;
  /** styleType 103 için işaretli mi; değilse null. */
  checklistDone: boolean | null;
}

export interface Note {
  id: number; // ZICCLOUDSYNCINGOBJECT.Z_PK
  title: string; // ZTITLE1
  snippet: string; // ZSNIPPET (önizleme)
  body: string; // decodeNoteRich(ZICNOTEDATA.ZDATA).text — düz metin
  /** Biçim aralıkları — boşsa düz metin göster. */
  runs: NoteRun[];
  createdIso: string | null; // ZCREATIONDATE → appleSecondsToDate → ISO
  modifiedIso: string | null; // ZMODIFICATIONDATE → appleSecondsToDate → ISO
  folderName: string | null; // ZFOLDER → ZTITLE2 (klasör adı)
}

export interface NotesRequest {
  udid: string;
  rootPath: string;
}

// ── Voice Memos (CloudRecordings.db — Core Data) ────────────────────────────
// AppDomainGroup-group.com.apple.VoiceMemos.shared / Recordings/CloudRecordings.db.
// Tablo ZCLOUDRECORDING (ZRECORDING DEĞİL — gerçek-veride ZRECORDING 0, ZCLOUDRECORDING 4).
// ZDATE Apple epoch SANİYE (FLOAT) → appleSecondsToDate. ZDURATION saniye (FLOAT).
// Ses dosyası m4a → Chromium native oynar → backup://orig (transcode GEREKMEZ).

export interface VoiceMemo {
  id: number; // ZCLOUDRECORDING.Z_PK
  title: string; // ZCUSTOMLABEL || ZPATH-tarihi (boşsa ISO tarih)
  dateIso: string | null; // ZDATE → appleSecondsToDate → ISO
  durationSec: number; // ZDURATION (saniye)
  fileId: string; // computeFileId(VoiceMemos.shared, `Recordings/${ZPATH}`)
}

export interface VoiceMemosRequest {
  udid: string;
  rootPath: string;
}

// ── Contacts (AddressBook.sqlitedb) ─────────────────────────────────────────
// HomeDomain / Library/AddressBook/AddressBook.sqlitedb.
// ABPerson ⨝ ABMultiValue. property 3=telefon, 4=email, 5=adres.
// displayName = First+Last || Organization || Nickname. Alfabetik sıralama
// FirstSort/LastSort (yoksa First COLLATE NOCASE). Birthday Apple epoch SANİYE (FLOAT) || NULL.

export interface Contact {
  id: number; // ABPerson.ROWID
  displayName: string; // First+Last || Organization || Nickname || (boşsa) '?'
  firstName: string | null; // ABPerson.First
  lastName: string | null; // ABPerson.Last
  organization: string | null; // ABPerson.Organization
  jobTitle: string | null; // ABPerson.JobTitle
  note: string | null; // ABPerson.Note
  birthdayIso: string | null; // ABPerson.Birthday → appleSecondsToDate → ISO (|| null)
  phones: string[]; // ABMultiValue property 3
  emails: string[]; // ABMultiValue property 4
  addresses: string[]; // ABMultiValue property 5 (düzleştirilmiş satır)
}

export interface ContactsRequest {
  udid: string;
  rootPath: string;
}
