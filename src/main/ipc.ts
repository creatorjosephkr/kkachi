import { app, BrowserWindow, ipcMain, shell } from 'electron';
import type {
  AccountConfig,
  AccountInput,
  AppSettings,
  AppUpdateInfo,
  EmailExportMode,
  ReplyPayload,
} from '../shared/types';
import type { AppStore } from './store';
import type { MailMonitor } from './mail/monitor';
import {
  setMainWindowExpanded,
  type AlertWindowManager,
  type MascotWindowManager,
  type WindowSizeState,
} from './windows';
import type { TrayManager } from './tray';
import { testImapConnection } from './mail/imapClient';
import { testPop3Connection } from './mail/pop3Client';
import { sendReplyEmail } from './mail/smtpClient';
import { printEmailDocument, saveEmailAsPdf } from './mail/printEmail';
import { translateHtmlToKorean, translateToKorean } from './translator';

interface RegisterIpcDeps {
  store: AppStore;
  monitor: MailMonitor;
  alertManager: AlertWindowManager;
  mascotManager: MascotWindowManager;
  trayManager: TrayManager;
  windowSizeState: WindowSizeState;
  getMainWindow: () => BrowserWindow | null;
  openMainWindow: (emailId?: string) => void;
  checkAppUpdate: () => Promise<AppUpdateInfo>;
  quitApp: () => void;
}

function buildTestAccountConfig(store: AppStore, input: AccountInput): AccountConfig {
  const existing = input.id ? store.getAccountById(input.id) : undefined;
  return {
    id: input.id || 'test-account',
    name: input.name,
    email: input.email,
    protocol: input.protocol,
    host: input.host,
    port: input.port,
    secure: input.secure,
    starttls: input.starttls,
    username: input.username,
    password: input.password || existing?.password || '',
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    enabled: input.enabled,
    color: input.color,
  };
}

export function registerIpcHandlers(deps: RegisterIpcDeps): void {
  const {
    store,
    monitor,
    alertManager,
    mascotManager,
    trayManager,
    windowSizeState,
    getMainWindow,
    openMainWindow,
    checkAppUpdate,
    quitApp,
  } = deps;

  const notifyEmailsUpdated = () => {
    trayManager.refresh();
    const unreadCount = store.getUnreadCount();
    mascotManager.updateState({
      unreadCount,
      ...(unreadCount === 0 ? { hasNewAlert: false } : {}),
    });
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('emails:updated');
    }
  };

  ipcMain.handle('accounts:list', () => store.getPublicAccounts());

  ipcMain.handle('accounts:save', (_event, input: AccountInput) => {
    const saved = store.saveAccount(input);
    notifyEmailsUpdated();
    return saved;
  });

  ipcMain.handle('accounts:delete', (_event, accountId: string) => {
    store.deleteAccount(accountId);
    notifyEmailsUpdated();
  });

  ipcMain.handle('accounts:test', async (_event, input: AccountInput) => {
    const config = buildTestAccountConfig(store, input);
    if (!config.host || !config.username || !config.password) {
      return {
        ok: false,
        message: '서버 주소, 아이디, 비밀번호를 모두 입력해 주세요.',
      };
    }

    try {
      if (config.protocol === 'pop3') {
        return await testPop3Connection(config);
      }
      return await testImapConnection(config);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : '서버 연결에 실패했습니다.',
      };
    }
  });

  ipcMain.handle('emails:list', (_event, accountId?: string) => {
    return store.getEmails(accountId);
  });

  ipcMain.handle('emails:markRead', (_event, emailId: string, isRead: boolean) => {
    store.markEmailRead(emailId, isRead);
    if (isRead) {
      alertManager.clearEmailAlerts({ emailId });
    }
    notifyEmailsUpdated();
  });

  ipcMain.handle('emails:markAllRead', (_event, accountId?: string) => {
    store.markAllRead(accountId);
    alertManager.clearEmailAlerts(accountId ? { accountId } : undefined);
    notifyEmailsUpdated();
  });

  ipcMain.handle('emails:delete', (_event, emailId: string) => {
    store.deleteEmail(emailId);
    alertManager.clearEmailAlerts({ emailId });
    notifyEmailsUpdated();
  });

  ipcMain.handle('emails:translate', async (_event, emailId: string, force = false) => {
    const email = store.getEmailById(emailId);
    if (!email) return null;

    const hasCachedBody = email.htmlBody
      ? Boolean(email.translatedHtml)
      : Boolean(email.translatedText);
    if (!force && hasCachedBody) return email;

    const settings = store.getSettings();
    const translatedSubject =
      !email.translatedSubject || force
        ? await translateToKorean(email.subject, settings)
        : email.translatedSubject;

    let translatedHtml = email.translatedHtml;
    let translatedText = email.translatedText;

    if (email.htmlBody) {
      translatedHtml = await translateHtmlToKorean(email.htmlBody, settings);
    } else if (email.textBody && email.textBody !== '(본문 없음)') {
      translatedText = await translateToKorean(email.textBody, settings);
    } else {
      translatedText = email.textBody;
    }

    const updated = store.updateEmail(emailId, {
      translatedSubject: translatedSubject || undefined,
      translatedText: translatedText || undefined,
      translatedHtml: translatedHtml || undefined,
    });
    notifyEmailsUpdated();
    return updated ?? null;
  });

  ipcMain.handle('emails:reply', async (_event, payload: ReplyPayload) => {
    const account = store.getAccountById(payload.accountId);
    if (!account) {
      return {
        ok: false,
        error: '발신할 계정을 찾을 수 없습니다.',
      };
    }
    const original = store.getEmailById(payload.originalEmailId);
    return sendReplyEmail(account, original, payload);
  });

  ipcMain.handle('emails:print', async (_event, emailId: string, mode: EmailExportMode) => {
    const email = store.getEmailById(emailId);
    if (!email) {
      return { ok: false, error: '이메일을 찾을 수 없습니다.' };
    }
    const account = store.getAccountById(email.accountId);
    try {
      return await printEmailDocument(email, {
        mode: mode === 'translated' ? 'translated' : 'original',
        accountName: account?.name || account?.email,
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : '인쇄 준비 중 오류가 발생했습니다.',
      };
    }
  });

  ipcMain.handle('emails:savePdf', async (_event, emailId: string, mode: EmailExportMode) => {
    const email = store.getEmailById(emailId);
    if (!email) {
      return { ok: false, error: '이메일을 찾을 수 없습니다.' };
    }
    const account = store.getAccountById(email.accountId);
    try {
      return await saveEmailAsPdf(email, {
        mode: mode === 'translated' ? 'translated' : 'original',
        accountName: account?.name || account?.email,
        parentWindow: getMainWindow(),
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'PDF 저장 중 오류가 발생했습니다.',
      };
    }
  });

  ipcMain.handle('monitor:checkNow', async () => {
    await monitor.checkNow();
  });

  ipcMain.handle('monitor:status', () => monitor.getStatus());

  ipcMain.handle('settings:get', () => store.getSettings());

  ipcMain.handle('settings:save', (_event, partial: Partial<AppSettings>) => {
    const prev = store.getSettings();
    const updated = store.saveSettings(partial);
    if (prev.pollIntervalSec !== updated.pollIntervalSec) {
      monitor.reschedule();
    }
    if (prev.mascotPosition !== updated.mascotPosition) {
      mascotManager.setPositionPreset(updated.mascotPosition);
    }
    if (
      prev.mascotFlightMode !== updated.mascotFlightMode ||
      prev.mascotFlightIntervalSec !== updated.mascotFlightIntervalSec
    ) {
      mascotManager.setFlightConfig(updated.mascotFlightMode, updated.mascotFlightIntervalSec);
    }
    trayManager.refresh();
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:updated', updated);
    }
    return updated;
  });

  ipcMain.handle('alert:test', () => {
    const settings = store.getSettings();
    const sampleId = store.getEmails()[0]?.id || 'sample-test-email';
    mascotManager.updateState({
      hasNewAlert: true,
      latestEmailId: sampleId,
      latestEmailSubject: '4분기 제품 출시 일정 및 디자인 리뷰',
      latestFromName: 'Sarah Jenkins',
    });
    alertManager.enqueue({
      email: {
        id: sampleId,
        accountId: 'preview',
        uid: 'preview',
        fromName: 'Sarah Jenkins',
        fromAddress: 'sarah@example.com',
        to: ['me@example.com'],
        subject: 'Q4 Product Launch Schedule & Design Review',
        translatedSubject: '4분기 제품 출시 일정 및 디자인 리뷰',
        date: new Date().toISOString(),
        snippet: 'Hi team, please check the updated launch checklist before Friday.',
        textBody: 'Hi team, please check the updated launch checklist before Friday.',
        isKorean: false,
        isRead: false,
        attachments: [],
      },
      accountName: '업무 메일 (테스트)',
      accountColor: '#2563EB',
      soundEnabled: settings.soundEnabled,
      soundPreset: settings.soundPreset,
      soundVolume: settings.soundVolume,
      durationSec: settings.alertDurationSec,
    });
  });

  ipcMain.handle('alert:openEmail', (_event, emailId: string) => {
    alertManager.dismissCurrent();
    if (emailId && emailId !== 'sample-test-email') {
      openMainWindow(emailId);
    } else {
      openMainWindow();
    }
  });

  ipcMain.handle('alert:dismiss', () => {
    alertManager.dismissCurrent();
  });

  ipcMain.handle('mascot:getState', () => mascotManager.getState());

  ipcMain.handle('mascot:openMenu', () => {
    mascotManager.showMenu({
      onOpenInbox: (emailId) => openMainWindow(emailId),
      onMarkAllRead: () => {
        store.markAllRead();
        alertManager.clearEmailAlerts();
        notifyEmailsUpdated();
      },
      onCheckNow: () => {
        void monitor.checkNow();
      },
      onQuit: quitApp,
      popupMenu: (menu) => trayManager?.popUpMenu(menu) ?? false,
    });
  });

  ipcMain.handle('mascot:openMain', (_event, emailId?: string) => {
    openMainWindow(emailId);
  });

  ipcMain.handle('mascot:moveBy', (_event, dx: number, dy: number) => {
    if (typeof dx === 'number' && typeof dy === 'number') {
      mascotManager.moveBy(dx, dy);
    }
  });

  ipcMain.handle('mascot:statusNotice', (_event, message: string) => {
    if (typeof message === 'string' && message.trim()) {
      alertManager.showStatusNotice(message.trim());
    }
  });

  ipcMain.handle('window:setExpanded', (_event, expanded: boolean) => {
    setMainWindowExpanded(getMainWindow(), Boolean(expanded), windowSizeState);
  });

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:checkUpdate', () => checkAppUpdate());
}
