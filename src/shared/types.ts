export type MailProtocol = 'imap' | 'pop3';

export type SoundPreset = 'kkachi' | 'chime' | 'soft';

export type TranslationProvider = 'google-free' | 'deepl' | 'openai';

export type ThemeMode = 'system' | 'light' | 'dark';

export type MascotPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type MascotFacing = 'right' | 'left';

export type TranslationViewMode = 'split' | 'stacked' | 'original';

export interface AccountConfig {
  id: string;
  name: string;
  email: string;
  protocol: MailProtocol;
  host: string;
  port: number;
  secure: boolean;
  starttls?: boolean;
  username: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  enabled: boolean;
  color: string;
  lastCheckedAt?: string;
  lastError?: string;
  initialSyncDone?: boolean;
  imapUidValidity?: string;
  imapLastUid?: number;
}

export type AccountPublic = Omit<AccountConfig, 'password'> & {
  hasPassword: boolean;
};

export type AccountInput = Omit<
  AccountConfig,
  'id' | 'lastCheckedAt' | 'lastError' | 'initialSyncDone' | 'imapUidValidity' | 'imapLastUid'
> & {
  id?: string;
};

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  accountId: string;
  uid: string;
  messageId?: string;
  fromName: string;
  fromAddress: string;
  to: string[];
  subject: string;
  translatedSubject?: string;
  date: string;
  snippet: string;
  textBody: string;
  htmlBody?: string;
  translatedText?: string;
  translatedHtml?: string;
  isKorean: boolean;
  isRead: boolean;
  attachments: EmailAttachment[];
}

export interface AppSettings {
  pollIntervalSec: number;
  initialFetchCount: number;
  soundEnabled: boolean;
  soundPreset: SoundPreset;
  soundVolume: number;
  alertPopupEnabled: boolean;
  alertDurationSec: number;
  nativeNotificationEnabled: boolean;
  autoTranslate: boolean;
  translationProvider: TranslationProvider;
  deeplApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  theme: ThemeMode;
  mascotPosition: MascotPosition;
  minimizeToTrayOnClose: boolean;
}

export interface ReplyPayload {
  accountId: string;
  originalEmailId: string;
  to: string;
  subject: string;
  body: string;
}

export interface NotificationPayload {
  kind?: 'email' | 'status';
  statusMessage?: string;
  email: EmailMessage;
  accountName: string;
  accountColor: string;
  soundEnabled: boolean;
  soundPreset: SoundPreset;
  soundVolume: number;
  durationSec: number;
}

export interface MonitorStatus {
  isChecking: boolean;
  currentAccountId: string | null;
  currentAccountName: string | null;
  currentIndex: number;
  totalAccounts: number;
  lastCycleCompletedAt?: string;
}

export interface MailProviderPreset {
  id: string;
  label: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  pop3Host: string;
  pop3Port: number;
  pop3Secure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  note?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  inboxCount?: number;
}

export interface SendReplyResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export type EmailExportMode = 'original' | 'translated';

export interface EmailExportResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface MascotState {
  unreadCount: number;
  hasNewAlert: boolean;
  isChecking: boolean;
  facing: MascotFacing;
  latestEmailId?: string;
  latestEmailSubject?: string;
  latestFromName?: string;
}

export interface MascotCursorDelta {
  dx: number;
  dy: number;
}

export interface KkachiAPI {
  getAccounts: () => Promise<AccountPublic[]>;
  saveAccount: (input: AccountInput) => Promise<AccountPublic>;
  deleteAccount: (accountId: string) => Promise<void>;
  testAccountConnection: (input: AccountInput) => Promise<ConnectionTestResult>;
  getEmails: (accountId?: string) => Promise<EmailMessage[]>;
  markEmailRead: (emailId: string, isRead: boolean) => Promise<void>;
  markAllRead: (accountId?: string) => Promise<void>;
  deleteEmail: (emailId: string) => Promise<void>;
  translateEmail: (emailId: string, force?: boolean) => Promise<EmailMessage | null>;
  sendReply: (payload: ReplyPayload) => Promise<SendReplyResult>;
  printEmail: (emailId: string, mode: EmailExportMode) => Promise<EmailExportResult>;
  saveEmailPdf: (emailId: string, mode: EmailExportMode) => Promise<EmailExportResult>;
  checkNow: () => Promise<void>;
  getMonitorStatus: () => Promise<MonitorStatus>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  testAlert: () => Promise<void>;
  openAlertEmail: (emailId: string) => Promise<void>;
  dismissAlertWindow: () => Promise<void>;
  getMascotState: () => Promise<MascotState>;
  openMascotMenu: () => Promise<void>;
  openMainWindow: (emailId?: string) => Promise<void>;
  moveMascotBy: (dx: number, dy: number) => Promise<void>;
  showMascotStatusNotice: (message: string) => Promise<void>;
  setWindowExpanded: (expanded: boolean) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onMonitorStatus: (cb: (status: MonitorStatus) => void) => () => void;
  onEmailsUpdated: (cb: () => void) => () => void;
  onSelectEmail: (cb: (emailId: string) => void) => () => void;
  onAlertPayload: (cb: (payload: NotificationPayload) => void) => () => void;
  onSettingsUpdated: (cb: (settings: AppSettings) => void) => () => void;
  onMascotState: (cb: (state: MascotState) => void) => () => void;
  onMascotCursor: (cb: (delta: MascotCursorDelta) => void) => () => void;
}
