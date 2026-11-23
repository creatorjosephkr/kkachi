import type {
  AccountConfig,
  AppSettings,
  EmailMessage,
  MonitorStatus,
  NotificationPayload,
} from '../../shared/types';
import type { AppStore } from '../store';
import { fetchImapEmails } from './imapClient';
import { fetchPop3Emails } from './pop3Client';
import { translateToKorean } from '../translator';

const MAX_ALERTS_PER_CYCLE = 5;
const ALERT_RECENCY_GRACE_MS = 24 * 60 * 60 * 1000;

export interface AccountFetcherResult {
  emails: EmailMessage[];
  allUids: string[];
  imapState?: {
    uidValidity: string;
    lastUid: number;
  };
}

export type AccountFetcher = (
  account: AccountConfig,
  options: {
    seenUids: Set<string>;
    initialFetchCount: number;
    initialSyncDone: boolean;
    imapUidValidity?: string;
    imapLastUid?: number;
  }
) => Promise<AccountFetcherResult>;

export type TranslatorFn = (text: string, settings: AppSettings) => Promise<string>;

export interface MailMonitorCallbacks {
  onStatusChange?: (status: MonitorStatus) => void;
  onEmailsUpdated?: () => void;
  onNewEmail?: (payload: NotificationPayload) => void;
}

export class MailMonitor {
  private readonly store: AppStore;
  private readonly callbacks: MailMonitorCallbacks;
  private readonly fetcher: AccountFetcher;
  private readonly translator: TranslatorFn;
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private running = false;
  private pendingCheck = false;
  private status: MonitorStatus = {
    isChecking: false,
    currentAccountId: null,
    currentAccountName: null,
    currentIndex: 0,
    totalAccounts: 0,
  };

  constructor(
    store: AppStore,
    callbacks: MailMonitorCallbacks = {},
    deps?: { fetcher?: AccountFetcher; translator?: TranslatorFn }
  ) {
    this.store = store;
    this.callbacks = callbacks;
    this.fetcher = deps?.fetcher ?? defaultFetcher;
    this.translator = deps?.translator ?? translateToKorean;
  }

  getStatus(): MonitorStatus {
    return { ...this.status };
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextPoll(): void {
    this.clearTimer();
    if (!this.started || this.running) return;
    const intervalSec = Math.max(15, this.store.getSettings().pollIntervalSec || 30);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.checkAllSequential();
    }, intervalSec * 1000);
  }

  start(): void {
    this.started = true;
    this.clearTimer();
    void this.checkAllSequential();
  }

  stop(): void {
    this.started = false;
    this.pendingCheck = false;
    this.clearTimer();
  }

  reschedule(): void {
    this.clearTimer();
    if (this.started && !this.running) {
      this.scheduleNextPoll();
    }
  }

  async checkNow(): Promise<void> {
    if (this.running) {
      this.pendingCheck = true;
      return;
    }
    await this.checkAllSequential();
  }

  private emitStatus(patch: Partial<MonitorStatus>): void {
    this.status = { ...this.status, ...patch };
    this.callbacks.onStatusChange?.(this.getStatus());
  }

  async checkAllSequential(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.clearTimer();

    try {
      const enabledAccounts = this.store.getAccounts().filter((acc) => acc.enabled);
      const totalAccounts = enabledAccounts.length;

      if (totalAccounts === 0) {
        this.emitStatus({
          isChecking: false,
          currentAccountId: null,
          currentAccountName: null,
          currentIndex: 0,
          totalAccounts: 0,
          lastCycleCompletedAt: new Date().toISOString(),
        });
        return;
      }

      // Strictly sequential account check: one account finishes before the next starts
      for (let i = 0; i < enabledAccounts.length; i++) {
        const account = enabledAccounts[i];
        this.emitStatus({
          isChecking: true,
          currentAccountId: account.id,
          currentAccountName: account.name || account.email,
          currentIndex: i + 1,
          totalAccounts,
        });

        await this.checkSingleAccount(account);
      }

      this.emitStatus({
        isChecking: false,
        currentAccountId: null,
        currentAccountName: null,
        currentIndex: 0,
        totalAccounts,
        lastCycleCompletedAt: new Date().toISOString(),
      });
    } finally {
      this.running = false;
      if (this.pendingCheck) {
        this.pendingCheck = false;
        void this.checkAllSequential();
      } else {
        this.scheduleNextPoll();
      }
    }
  }

  private async checkSingleAccount(account: AccountConfig): Promise<void> {
    const settings = this.store.getSettings();
    const seenUids = this.store.getSeenUids(account.id);
    const initialSyncDone = Boolean(account.initialSyncDone);

    try {
      const result = await this.fetcher(account, {
        seenUids,
        initialFetchCount: settings.initialFetchCount,
        initialSyncDone,
        imapUidValidity: account.imapUidValidity,
        imapLastUid: account.imapLastUid,
      });

      const newEmails = result.emails.filter((email) => !seenUids.has(email.uid));

      // Translate only the email subject automatically on arrival for notifications;
      // full body/HTML translation runs lazily when the user opens the Translate tab.
      if (settings.autoTranslate && newEmails.length > 0) {
        for (const email of newEmails) {
          if (!email.isKorean) {
            await this.translateEmailInPlace(email, settings, true);
          }
        }
      }

      if (newEmails.length > 0) {
        this.store.addEmails(newEmails);
      }

      const uidsToMark = new Set<string>([
        ...result.allUids,
        ...newEmails.map((e) => e.uid),
      ]);
      if (uidsToMark.size > 0) {
        this.store.addSeenUids(account.id, Array.from(uidsToMark));
      }

      this.store.updateAccountSyncState(account.id, {
        lastCheckedAt: new Date().toISOString(),
        lastError: undefined,
        initialSyncDone: true,
        ...(result.imapState
          ? {
              imapUidValidity: result.imapState.uidValidity,
              imapLastUid: result.imapState.lastUid,
            }
          : {}),
      });

      if (newEmails.length > 0 || !initialSyncDone) {
        this.callbacks.onEmailsUpdated?.();
      }

      // Only trigger new-mail alerts after initial sync, ignoring already-read or historical backlog emails
      if (initialSyncDone && newEmails.length > 0) {
        const lastCheckedMs = account.lastCheckedAt
          ? new Date(account.lastCheckedAt).getTime()
          : Number.NaN;
        const alertable = newEmails.filter((email) => {
          if (email.isRead) return false;
          if (Number.isFinite(lastCheckedMs)) {
            const emailMs = new Date(email.date).getTime();
            if (Number.isFinite(emailMs) && emailMs < lastCheckedMs - ALERT_RECENCY_GRACE_MS) {
              return false;
            }
          }
          return true;
        });

        const sortedAlerts = [...alertable]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-MAX_ALERTS_PER_CYCLE);

        for (const email of sortedAlerts) {
          this.callbacks.onNewEmail?.({
            email,
            accountName: account.name || account.email,
            accountColor: account.color,
            soundEnabled: settings.soundEnabled,
            soundPreset: settings.soundPreset,
            soundVolume: settings.soundVolume,
            durationSec: settings.alertDurationSec,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '계정 확인 중 오류가 발생했습니다.';
      this.store.updateAccountSyncState(account.id, {
        lastCheckedAt: new Date().toISOString(),
        lastError: message,
      });
      this.callbacks.onEmailsUpdated?.();
    }
  }

  private async translateEmailInPlace(
    email: EmailMessage,
    settings: AppSettings,
    subjectOnly = false
  ): Promise<void> {
    try {
      if (subjectOnly) {
        const translatedSubject = await this.translator(email.subject, settings);
        email.translatedSubject = translatedSubject || undefined;
        return;
      }

      const [translatedSubject, translatedText] = await Promise.all([
        this.translator(email.subject, settings),
        email.textBody && email.textBody !== '(본문 없음)'
          ? this.translator(email.textBody, settings)
          : Promise.resolve(email.textBody),
      ]);
      email.translatedSubject = translatedSubject || undefined;
      email.translatedText = translatedText || undefined;
    } catch {
      // Non-fatal: user can still read original and retry translation manually
    }
  }
}

async function defaultFetcher(
  account: AccountConfig,
  options: {
    seenUids: Set<string>;
    initialFetchCount: number;
    initialSyncDone: boolean;
    imapUidValidity?: string;
    imapLastUid?: number;
  }
): Promise<AccountFetcherResult> {
  if (account.protocol === 'pop3') {
    return fetchPop3Emails(account, options);
  }
  return fetchImapEmails(account, options);
}
