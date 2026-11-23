import { contextBridge, ipcRenderer } from 'electron';
import type {
  AccountInput,
  AppSettings,
  EmailExportMode,
  KkachiAPI,
  MascotCursorDelta,
  MascotState,
  MonitorStatus,
  NotificationPayload,
  ReplyPayload,
} from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: KkachiAPI = {
  getAccounts: () => ipcRenderer.invoke('accounts:list'),
  saveAccount: (input: AccountInput) => ipcRenderer.invoke('accounts:save', input),
  deleteAccount: (accountId: string) => ipcRenderer.invoke('accounts:delete', accountId),
  testAccountConnection: (input: AccountInput) => ipcRenderer.invoke('accounts:test', input),
  getEmails: (accountId?: string) => ipcRenderer.invoke('emails:list', accountId),
  markEmailRead: (emailId: string, isRead: boolean) =>
    ipcRenderer.invoke('emails:markRead', emailId, isRead),
  markAllRead: (accountId?: string) => ipcRenderer.invoke('emails:markAllRead', accountId),
  deleteEmail: (emailId: string) => ipcRenderer.invoke('emails:delete', emailId),
  translateEmail: (emailId: string, force?: boolean) =>
    ipcRenderer.invoke('emails:translate', emailId, force),
  sendReply: (payload: ReplyPayload) => ipcRenderer.invoke('emails:reply', payload),
  printEmail: (emailId: string, mode: EmailExportMode) =>
    ipcRenderer.invoke('emails:print', emailId, mode),
  saveEmailPdf: (emailId: string, mode: EmailExportMode) =>
    ipcRenderer.invoke('emails:savePdf', emailId, mode),
  checkNow: () => ipcRenderer.invoke('monitor:checkNow'),
  getMonitorStatus: () => ipcRenderer.invoke('monitor:status'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', partial),
  testAlert: () => ipcRenderer.invoke('alert:test'),
  openAlertEmail: (emailId: string) => ipcRenderer.invoke('alert:openEmail', emailId),
  dismissAlertWindow: () => ipcRenderer.invoke('alert:dismiss'),
  getMascotState: () => ipcRenderer.invoke('mascot:getState'),
  openMascotMenu: () => ipcRenderer.invoke('mascot:openMenu'),
  openMainWindow: (emailId?: string) => ipcRenderer.invoke('mascot:openMain', emailId),
  moveMascotBy: (dx: number, dy: number) => ipcRenderer.invoke('mascot:moveBy', dx, dy),
  showMascotStatusNotice: (message: string) => ipcRenderer.invoke('mascot:statusNotice', message),
  setWindowExpanded: (expanded: boolean) => ipcRenderer.invoke('window:setExpanded', expanded),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  onMonitorStatus: (cb: (status: MonitorStatus) => void) => subscribe('monitor:status', cb),
  onEmailsUpdated: (cb: () => void) => subscribe('emails:updated', () => cb()),
  onSelectEmail: (cb: (emailId: string) => void) => subscribe('email:select', cb),
  onAlertPayload: (cb: (payload: NotificationPayload) => void) => subscribe('alert:payload', cb),
  onSettingsUpdated: (cb: (settings: AppSettings) => void) => subscribe('settings:updated', cb),
  onMascotState: (cb: (state: MascotState) => void) => subscribe('mascot:state', cb),
  onMascotCursor: (cb: (delta: MascotCursorDelta) => void) => subscribe('mascot:cursor', cb),
};

contextBridge.exposeInMainWorld('kkachi', api);
