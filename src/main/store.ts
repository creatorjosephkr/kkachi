import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AccountConfig,
  AccountInput,
  AccountPublic,
  AppSettings,
  EmailMessage,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/presets';

interface PersistedAccount extends Omit<AccountConfig, 'password'> {
  encryptedPassword: string;
}

interface PersistedData {
  version: 1;
  accounts: PersistedAccount[];
  emails: EmailMessage[];
  seenUids: Record<string, string[]>;
  settings: AppSettings;
}

const MAX_EMAILS_PER_ACCOUNT = 200;
const MAX_SEEN_UIDS_PER_ACCOUNT = 1500;

export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(encoded: string): string;
}

function createElectronCipher(): SecretCipher {
  // Dynamically require electron so pure Node unit tests can instantiate AppStore without Electron
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { safeStorage } = require('electron') as typeof import('electron');
  return {
    encrypt(plain: string): string {
      if (!plain) return '';
      try {
        if (safeStorage?.isEncryptionAvailable()) {
          return 'safe:' + safeStorage.encryptString(plain).toString('base64');
        }
      } catch {
        // fallback below
      }
      return 'b64:' + Buffer.from(plain, 'utf8').toString('base64');
    },
    decrypt(encoded: string): string {
      if (!encoded) return '';
      if (encoded.startsWith('safe:')) {
        try {
          if (safeStorage?.isEncryptionAvailable()) {
            const buf = Buffer.from(encoded.slice(5), 'base64');
            return safeStorage.decryptString(buf);
          }
        } catch {
          return '';
        }
      }
      if (encoded.startsWith('b64:')) {
        return Buffer.from(encoded.slice(4), 'base64').toString('utf8');
      }
      return encoded;
    },
  };
}

export class AppStore {
  private readonly filePath: string;
  private readonly cipher: SecretCipher;
  private data: PersistedData;

  constructor(filePath: string, cipher?: SecretCipher) {
    this.filePath = filePath;
    this.cipher = cipher ?? createElectronCipher();
    this.data = this.load();
  }

  private createDefaultData(): PersistedData {
    return {
      version: 1,
      accounts: [],
      emails: [],
      seenUids: {},
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  private load(): PersistedData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return this.createDefaultData();
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedData>;
      return {
        version: 1,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        emails: Array.isArray(parsed.emails) ? parsed.emails : [],
        seenUids: parsed.seenUids && typeof parsed.seenUids === 'object' ? parsed.seenUids : {},
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
    } catch {
      return this.createDefaultData();
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  private toAccountConfig(persisted: PersistedAccount): AccountConfig {
    const { encryptedPassword, ...rest } = persisted;
    return {
      ...rest,
      password: this.cipher.decrypt(encryptedPassword),
    };
  }

  private toAccountPublic(persisted: PersistedAccount): AccountPublic {
    const { encryptedPassword, ...rest } = persisted;
    return {
      ...rest,
      hasPassword: Boolean(encryptedPassword),
    };
  }

  getAccounts(): AccountConfig[] {
    return this.data.accounts.map((acc) => this.toAccountConfig(acc));
  }

  getPublicAccounts(): AccountPublic[] {
    return this.data.accounts.map((acc) => this.toAccountPublic(acc));
  }

  getAccountById(accountId: string): AccountConfig | undefined {
    const found = this.data.accounts.find((acc) => acc.id === accountId);
    return found ? this.toAccountConfig(found) : undefined;
  }

  saveAccount(input: AccountInput): AccountPublic {
    const existingIdx = input.id
      ? this.data.accounts.findIndex((acc) => acc.id === input.id)
      : -1;

    if (existingIdx >= 0) {
      const existing = this.data.accounts[existingIdx];
      const encryptedPassword = input.password
        ? this.cipher.encrypt(input.password)
        : existing.encryptedPassword;
      const connectionChanged =
        existing.host !== input.host ||
        existing.port !== input.port ||
        existing.username !== input.username ||
        existing.protocol !== input.protocol;

      const updated: PersistedAccount = {
        ...existing,
        name: input.name,
        email: input.email,
        protocol: input.protocol,
        host: input.host,
        port: input.port,
        secure: input.secure,
        starttls: input.starttls,
        username: input.username,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        enabled: input.enabled,
        color: input.color,
        encryptedPassword,
        ...(connectionChanged
          ? {
              imapUidValidity: undefined,
              imapLastUid: undefined,
              initialSyncDone: false,
            }
          : {}),
      };
      this.data.accounts[existingIdx] = updated;
      this.save();
      return this.toAccountPublic(updated);
    }

    const created: PersistedAccount = {
      id: input.id || crypto.randomUUID(),
      name: input.name,
      email: input.email,
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      secure: input.secure,
      starttls: input.starttls,
      username: input.username,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      enabled: input.enabled,
      color: input.color,
      encryptedPassword: this.cipher.encrypt(input.password),
      initialSyncDone: false,
    };
    this.data.accounts.push(created);
    this.save();
    return this.toAccountPublic(created);
  }

  updateAccountSyncState(
    accountId: string,
    patch: Partial<
      Pick<AccountConfig, 'lastCheckedAt' | 'lastError' | 'initialSyncDone' | 'imapUidValidity' | 'imapLastUid'>
    >
  ): void {
    const acc = this.data.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    if ('lastCheckedAt' in patch) acc.lastCheckedAt = patch.lastCheckedAt;
    if ('lastError' in patch) acc.lastError = patch.lastError;
    if ('initialSyncDone' in patch) acc.initialSyncDone = patch.initialSyncDone;
    if ('imapUidValidity' in patch) acc.imapUidValidity = patch.imapUidValidity;
    if ('imapLastUid' in patch) acc.imapLastUid = patch.imapLastUid;
    this.save();
  }

  deleteAccount(accountId: string): void {
    this.data.accounts = this.data.accounts.filter((a) => a.id !== accountId);
    this.data.emails = this.data.emails.filter((e) => e.accountId !== accountId);
    delete this.data.seenUids[accountId];
    this.save();
  }

  getSeenUids(accountId: string): Set<string> {
    return new Set(this.data.seenUids[accountId] ?? []);
  }

  addSeenUids(accountId: string, uids: string[]): void {
    const existing = this.data.seenUids[accountId] ?? [];
    const merged = Array.from(new Set([...existing, ...uids]));
    this.data.seenUids[accountId] = merged.slice(-MAX_SEEN_UIDS_PER_ACCOUNT);
    this.save();
  }

  getEmails(accountId?: string): EmailMessage[] {
    const list = accountId
      ? this.data.emails.filter((e) => e.accountId === accountId)
      : [...this.data.emails];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getEmailById(emailId: string): EmailMessage | undefined {
    return this.data.emails.find((e) => e.id === emailId);
  }

  addEmails(newEmails: EmailMessage[]): void {
    if (newEmails.length === 0) return;

    const existingIds = new Set(this.data.emails.map((e) => e.id));
    for (const email of newEmails) {
      if (!existingIds.has(email.id)) {
        this.data.emails.push(email);
        existingIds.add(email.id);
      }
    }

    // Trim per account to prevent unbounded growth
    const grouped = new Map<string, EmailMessage[]>();
    for (const email of this.data.emails) {
      const arr = grouped.get(email.accountId) ?? [];
      arr.push(email);
      grouped.set(email.accountId, arr);
    }

    const trimmed: EmailMessage[] = [];
    for (const list of grouped.values()) {
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      trimmed.push(...list.slice(0, MAX_EMAILS_PER_ACCOUNT));
    }

    this.data.emails = trimmed;
    this.save();
  }

  updateEmail(emailId: string, patch: Partial<EmailMessage>): EmailMessage | undefined {
    const idx = this.data.emails.findIndex((e) => e.id === emailId);
    if (idx < 0) return undefined;
    this.data.emails[idx] = { ...this.data.emails[idx], ...patch };
    this.save();
    return this.data.emails[idx];
  }

  markEmailRead(emailId: string, isRead: boolean): void {
    this.updateEmail(emailId, { isRead });
  }

  markAllRead(accountId?: string): void {
    let changed = false;
    for (const email of this.data.emails) {
      if ((!accountId || email.accountId === accountId) && !email.isRead) {
        email.isRead = true;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  deleteEmail(emailId: string): void {
    this.data.emails = this.data.emails.filter((e) => e.id !== emailId);
    this.save();
  }

  getUnreadCount(accountId?: string): number {
    return this.data.emails.filter(
      (e) => !e.isRead && (!accountId || e.accountId === accountId)
    ).length;
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  saveSettings(partial: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
    return this.getSettings();
  }
}
