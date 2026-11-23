import path from 'node:path';
import {
  BrowserWindow,
  Menu,
  Notification,
  screen,
  shell,
} from 'electron';
import type { MascotFacing, MascotPosition, MascotState, NotificationPayload } from '../shared/types';
import type { AppStore } from './store';

export function resolveRendererTarget(query?: Record<string, string>): {
  url?: string;
  file?: string;
  search?: Record<string, string>;
} {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const parsed = new URL(devUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        parsed.searchParams.set(k, v);
      }
    }
    return { url: parsed.toString() };
  }

  return {
    file: path.join(__dirname, '../renderer/index.html'),
    search: query,
  };
}

export const COMPACT_WINDOW_WIDTH = 620;
export const COMPACT_WINDOW_MIN_WIDTH = 520;
export const EXPANDED_WINDOW_WIDTH = 1360;
export const EXPANDED_WINDOW_MIN_WIDTH = 1040;
const DEFAULT_WINDOW_HEIGHT = 780;
const DEFAULT_WINDOW_MIN_HEIGHT = 580;

export interface WindowSizeState {
  expanded: boolean;
  compactWidth: number;
  expandedWidth: number;
}

export function createMainWindow(
  preloadPath: string,
  store: AppStore,
  isQuittingRef: { current: boolean },
  showOnReady = false
): BrowserWindow {
  const iconPath = path.join(__dirname, '../../build/icon.png');
  const win = new BrowserWindow({
    width: COMPACT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: COMPACT_WINDOW_MIN_WIDTH,
    minHeight: DEFAULT_WINDOW_MIN_HEIGHT,
    title: '까치 (Kkachi)',
    icon: iconPath,
    show: false,
    backgroundColor: '#f8fafc',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 15 } : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (showOnReady) {
    win.once('ready-to-show', () => {
      win.show();
    });
  }

  win.on('close', (event) => {
    if (!isQuittingRef.current) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const target = resolveRendererTarget();
  if (target.url) {
    void win.loadURL(target.url);
  } else if (target.file) {
    void win.loadFile(target.file);
  }

  return win;
}

export function setMainWindowExpanded(
  win: BrowserWindow | null,
  expanded: boolean,
  state: WindowSizeState
): void {
  if (!win || win.isDestroyed()) return;
  if (state.expanded === expanded) return;

  if (win.isMaximized() || win.isFullScreen()) {
    state.expanded = expanded;
    return;
  }

  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const { x: areaX, width: areaWidth } = display.workArea;

  if (expanded) {
    state.compactWidth = bounds.width;
    state.expanded = true;
    win.setMinimumSize(EXPANDED_WINDOW_MIN_WIDTH, DEFAULT_WINDOW_MIN_HEIGHT);
    const targetWidth = Math.min(
      areaWidth,
      Math.max(EXPANDED_WINDOW_MIN_WIDTH, state.expandedWidth)
    );
    const targetX = Math.max(
      areaX,
      Math.min(bounds.x, areaX + areaWidth - targetWidth)
    );
    win.setBounds(
      {
        x: Math.round(targetX),
        y: bounds.y,
        width: Math.round(targetWidth),
        height: bounds.height,
      },
      true
    );
    return;
  }

  state.expandedWidth = bounds.width;
  state.expanded = false;
  win.setMinimumSize(COMPACT_WINDOW_MIN_WIDTH, DEFAULT_WINDOW_MIN_HEIGHT);
  const targetWidth = Math.max(
    COMPACT_WINDOW_MIN_WIDTH,
    Math.min(areaWidth, state.compactWidth)
  );
  win.setBounds(
    {
      x: bounds.x,
      y: bounds.y,
      width: Math.round(targetWidth),
      height: bounds.height,
    },
    true
  );
}

const ALERT_WIDTH = 304;
const ALERT_HEIGHT = 88;

export class AlertWindowManager {
  private readonly preloadPath: string;
  private readonly store: AppStore;
  private readonly onSelectEmail: (emailId: string) => void;
  private readonly getMascotBounds: () => Electron.Rectangle | null;
  private alertWin: BrowserWindow | null = null;
  private queue: NotificationPayload[] = [];
  private activeTimer: NodeJS.Timeout | null = null;
  private showing = false;
  private ready = false;
  private pendingPayload: NotificationPayload | null = null;
  private currentPayload: NotificationPayload | null = null;

  constructor(
    preloadPath: string,
    store: AppStore,
    onSelectEmail: (emailId: string) => void,
    getMascotBounds: () => Electron.Rectangle | null
  ) {
    this.preloadPath = preloadPath;
    this.store = store;
    this.onSelectEmail = onSelectEmail;
    this.getMascotBounds = getMascotBounds;
  }

  enqueue(payload: NotificationPayload): void {
    if (payload.kind !== 'status') {
      const alreadyActive =
        this.currentPayload?.kind !== 'status' &&
        this.currentPayload?.email.id === payload.email.id;
      const alreadyQueued = this.queue.some(
        (p) => p.kind !== 'status' && p.email.id === payload.email.id
      );
      if (alreadyActive || alreadyQueued) {
        return;
      }
    }

    const settings = this.store.getSettings();

    if (settings.nativeNotificationEnabled && Notification.isSupported()) {
      const title = `${payload.accountName} · ${payload.email.fromName}`;
      const body = payload.email.translatedSubject || payload.email.subject;
      const nativeNotif = new Notification({ title, body, silent: true });
      nativeNotif.on('click', () => {
        this.onSelectEmail(payload.email.id);
      });
      nativeNotif.show();
    }

    if (!settings.alertPopupEnabled && !payload.soundEnabled) {
      return;
    }

    this.queue.push(payload);
    if (!this.showing) {
      this.showNext();
    }
  }

  showStatusNotice(message: string, durationSec = 3.5): void {
    if (this.showing || this.queue.length > 0) {
      return;
    }

    this.queue.push({
      kind: 'status',
      statusMessage: message,
      email: {
        id: 'status-notice',
        accountId: 'status',
        uid: 'status',
        fromName: '까치',
        fromAddress: '',
        to: [],
        subject: message,
        date: new Date().toISOString(),
        snippet: message,
        textBody: message,
        isKorean: true,
        isRead: true,
        attachments: [],
      },
      accountName: '까치',
      accountColor: '#6E9BFF',
      soundEnabled: false,
      soundPreset: 'soft',
      soundVolume: 0,
      durationSec,
    });
    this.showNext();
  }

  clearEmailAlerts(filter?: { emailId?: string; accountId?: string }): void {
    const matches = (p: NotificationPayload) =>
      p.kind !== 'status' &&
      (!filter?.emailId || p.email.id === filter.emailId) &&
      (!filter?.accountId || p.email.accountId === filter.accountId);

    this.queue = this.queue.filter((p) => !matches(p));
    if (this.showing && this.currentPayload && matches(this.currentPayload)) {
      this.dismissCurrent();
    }
  }

  dismissCurrent(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.alertWin && !this.alertWin.isDestroyed()) {
      this.alertWin.hide();
    }
    this.showing = false;
    this.currentPayload = null;

    if (this.queue.length > 0) {
      setTimeout(() => {
        this.showNext();
      }, 200);
    }
  }

  destroy(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.queue = [];
    this.currentPayload = null;
    this.showing = false;
    if (this.alertWin && !this.alertWin.isDestroyed()) {
      this.alertWin.destroy();
    }
    this.alertWin = null;
  }

  repositionIfVisible(): void {
    if (this.showing && this.alertWin && !this.alertWin.isDestroyed() && this.alertWin.isVisible()) {
      this.positionAlertWindow(this.alertWin);
    }
  }

  private positionAlertWindow(win: BrowserWindow): void {
    const mascotBounds = this.getMascotBounds();
    const display = mascotBounds
      ? screen.getDisplayMatching(mascotBounds)
      : screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;

    let posX: number;
    let posY: number;

    if (mascotBounds) {
      // Place popup adjacent to the left edge of the mascot icon; flip right if off-screen
      const leftSideX = mascotBounds.x - ALERT_WIDTH + 14;
      if (leftSideX >= x) {
        posX = leftSideX;
      } else {
        posX = Math.min(x + width - ALERT_WIDTH, mascotBounds.x + mascotBounds.width - 14);
      }
      const centeredY = mascotBounds.y + (mascotBounds.height - ALERT_HEIGHT) / 2;
      posY = Math.max(y + 8, Math.min(y + height - ALERT_HEIGHT - 8, centeredY));
    } else {
      posX = x + 146;
      posY = y + 28;
    }

    win.setBounds({
      x: Math.round(posX),
      y: Math.round(posY),
      width: ALERT_WIDTH,
      height: ALERT_HEIGHT,
    });
  }

  private ensureWindow(): BrowserWindow {
    if (this.alertWin && !this.alertWin.isDestroyed()) {
      return this.alertWin;
    }

    this.ready = false;
    const win = new BrowserWindow({
      width: ALERT_WIDTH,
      height: ALERT_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      roundedCorners: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setBackgroundColor('#00000000');

    win.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    win.webContents.once('did-finish-load', () => {
      this.ready = true;
      if (this.pendingPayload && !win.isDestroyed()) {
        win.webContents.send('alert:payload', this.pendingPayload);
        this.pendingPayload = null;
      }
    });

    win.on('closed', () => {
      this.alertWin = null;
      this.ready = false;
    });

    const target = resolveRendererTarget({ mode: 'alert' });
    if (target.url) {
      void win.loadURL(target.url);
    } else if (target.file) {
      void win.loadFile(target.file, { query: target.search });
    }

    this.alertWin = win;
    return win;
  }

  private showNext(): void {
    let next: NotificationPayload | undefined;
    while (this.queue.length > 0) {
      const candidate = this.queue.shift();
      if (!candidate) continue;
      if (candidate.kind !== 'status') {
        const stored = this.store.getEmailById(candidate.email.id);
        if (!stored || stored.isRead) {
          continue;
        }
      }
      next = candidate;
      break;
    }

    if (!next) {
      this.showing = false;
      this.currentPayload = null;
      return;
    }

    this.showing = true;
    this.currentPayload = next;
    const settings = this.store.getSettings();
    const win = this.ensureWindow();
    this.positionAlertWindow(win);

    if (this.ready) {
      win.webContents.send('alert:payload', next);
    } else {
      this.pendingPayload = next;
    }

    if (settings.alertPopupEnabled || next.kind === 'status') {
      win.showInactive();
    }

    const durationMs = Math.max(3, next.durationSec || 8) * 1000;
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
    }
    this.activeTimer = setTimeout(() => {
      this.dismissCurrent();
    }, durationMs);
  }
}

const MASCOT_SIZE = 132;
const MASCOT_MARGIN = 20;
const CURSOR_POLL_MS = 60;

export function computeMascotPosition(
  position: MascotPosition,
  size: number,
  workArea: Electron.Rectangle
): { x: number; y: number } {
  switch (position) {
    case 'top-right':
      return {
        x: Math.round(workArea.x + workArea.width - size - MASCOT_MARGIN),
        y: Math.round(workArea.y + MASCOT_MARGIN),
      };
    case 'bottom-left':
      return {
        x: Math.round(workArea.x + MASCOT_MARGIN),
        y: Math.round(workArea.y + workArea.height - size - MASCOT_MARGIN),
      };
    case 'bottom-right':
      return {
        x: Math.round(workArea.x + workArea.width - size - MASCOT_MARGIN),
        y: Math.round(workArea.y + workArea.height - size - MASCOT_MARGIN),
      };
    case 'top-left':
    default:
      return {
        x: Math.round(workArea.x + MASCOT_MARGIN),
        y: Math.round(workArea.y + MASCOT_MARGIN),
      };
  }
}

export function computeMascotFacing(
  bounds: Pick<Electron.Rectangle, 'x' | 'width'>,
  workArea: Pick<Electron.Rectangle, 'x' | 'width'>
): MascotFacing {
  const mascotCenterX = bounds.x + bounds.width / 2;
  const screenCenterX = workArea.x + workArea.width / 2;
  return mascotCenterX < screenCenterX ? 'right' : 'left';
}

export class MascotWindowManager {
  private readonly preloadPath: string;
  private initialPosition: MascotPosition;
  private mascotWin: BrowserWindow | null = null;
  private onMoveCallback: (() => void) | null = null;
  private cursorPollTimer: NodeJS.Timeout | null = null;
  private lastCursorPoint: { x: number; y: number } | null = null;
  private state: MascotState = {
    unreadCount: 0,
    hasNewAlert: false,
    isChecking: false,
    facing: 'right',
  };

  constructor(
    preloadPath: string,
    initialUnreadCount: number,
    initialPosition: MascotPosition = 'top-left'
  ) {
    this.preloadPath = preloadPath;
    this.state.unreadCount = initialUnreadCount;
    this.initialPosition = initialPosition;
    this.state.facing =
      initialPosition === 'top-right' || initialPosition === 'bottom-right' ? 'left' : 'right';
  }

  private syncFacing(
    bounds: Pick<Electron.Rectangle, 'x' | 'width'>,
    workArea: Pick<Electron.Rectangle, 'x' | 'width'>
  ): void {
    const nextFacing = computeMascotFacing(bounds, workArea);
    if (nextFacing !== this.state.facing) {
      this.updateState({ facing: nextFacing });
    }
  }

  setOnMove(cb: () => void): void {
    this.onMoveCallback = cb;
  }

  getBounds(): Electron.Rectangle | null {
    if (!this.mascotWin || this.mascotWin.isDestroyed()) return null;
    return this.mascotWin.getBounds();
  }

  setPositionPreset(position: MascotPosition): void {
    this.initialPosition = position;
    if (!this.mascotWin || this.mascotWin.isDestroyed()) return;
    const display = screen.getDisplayMatching(this.mascotWin.getBounds());
    const coords = computeMascotPosition(position, MASCOT_SIZE, display.workArea);
    this.mascotWin.setPosition(coords.x, coords.y);
    this.syncFacing({ x: coords.x, width: MASCOT_SIZE }, display.workArea);
    this.onMoveCallback?.();
  }

  init(): void {
    if (this.mascotWin && !this.mascotWin.isDestroyed()) {
      this.mascotWin.showInactive();
      return;
    }

    const primary = screen.getPrimaryDisplay();
    const coords = computeMascotPosition(this.initialPosition, MASCOT_SIZE, primary.workArea);
    this.state.facing = computeMascotFacing({ x: coords.x, width: MASCOT_SIZE }, primary.workArea);

    const win = new BrowserWindow({
      width: MASCOT_SIZE,
      height: MASCOT_SIZE,
      x: coords.x,
      y: coords.y,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      roundedCorners: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setBackgroundColor('#00000000');

    win.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    win.once('ready-to-show', () => {
      win.showInactive();
    });

    win.webContents.on('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('mascot:state', this.state);
      }
    });

    win.on('closed', () => {
      this.stopCursorTracking();
      this.mascotWin = null;
    });

    const target = resolveRendererTarget({ mode: 'mascot' });
    if (target.url) {
      void win.loadURL(target.url);
    } else if (target.file) {
      void win.loadFile(target.file, { query: target.search });
    }

    this.mascotWin = win;
    this.startCursorTracking();
  }

  private startCursorTracking(): void {
    this.stopCursorTracking();
    this.cursorPollTimer = setInterval(() => {
      if (!this.mascotWin || this.mascotWin.isDestroyed() || !this.mascotWin.isVisible()) {
        return;
      }
      const pt = screen.getCursorScreenPoint();
      if (
        this.lastCursorPoint &&
        this.lastCursorPoint.x === pt.x &&
        this.lastCursorPoint.y === pt.y
      ) {
        return;
      }
      this.lastCursorPoint = pt;
      const bounds = this.mascotWin.getBounds();
      const dx = pt.x - (bounds.x + bounds.width / 2);
      const dy = pt.y - (bounds.y + bounds.height / 2);
      this.mascotWin.webContents.send('mascot:cursor', { dx, dy });
    }, CURSOR_POLL_MS);
  }

  private stopCursorTracking(): void {
    if (this.cursorPollTimer) {
      clearInterval(this.cursorPollTimer);
      this.cursorPollTimer = null;
    }
    this.lastCursorPoint = null;
  }

  getState(): MascotState {
    return { ...this.state };
  }

  updateState(patch: Partial<MascotState>): void {
    this.state = { ...this.state, ...patch };
    if (this.mascotWin && !this.mascotWin.isDestroyed()) {
      this.mascotWin.webContents.send('mascot:state', this.state);
    }
  }

  moveBy(dx: number, dy: number): void {
    if (!this.mascotWin || this.mascotWin.isDestroyed()) return;
    const [curX, curY] = this.mascotWin.getPosition();
    const [winW, winH] = this.mascotWin.getSize();
    const display = screen.getDisplayMatching(this.mascotWin.getBounds());
    const { x, y, width, height } = display.workArea;

    const nextX = Math.max(x, Math.min(x + width - winW, Math.round(curX + dx)));
    const nextY = Math.max(y, Math.min(y + height - winH, Math.round(curY + dy)));
    this.mascotWin.setPosition(nextX, nextY);
    this.syncFacing({ x: nextX, width: winW }, display.workArea);
    this.onMoveCallback?.();
  }

  showMenu(actions: {
    onOpenInbox: (emailId?: string) => void;
    onMarkAllRead?: () => void;
    onCheckNow: () => void;
    onQuit: () => void;
  }): void {
    if (!this.mascotWin || this.mascotWin.isDestroyed()) return;

    const { unreadCount, hasNewAlert, latestEmailId, latestEmailSubject, latestFromName } =
      this.state;

    const template: Electron.MenuItemConstructorOptions[] = [];

    if (hasNewAlert && latestEmailId && latestEmailId !== 'sample-test-email') {
      const previewLabel = [latestFromName, latestEmailSubject]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 38);
      template.push({
        label: `새 메일 열기${previewLabel ? ` (${previewLabel})` : ''}`,
        click: () => actions.onOpenInbox(latestEmailId),
      });
    }

    template.push({
      label: unreadCount > 0 ? `이메일함 열기 (안 읽은 메일 ${unreadCount}통)` : '이메일함 열기',
      click: () => actions.onOpenInbox(),
    });

    if (unreadCount > 0 && actions.onMarkAllRead) {
      template.push({
        label: '모두 읽음 처리',
        click: () => actions.onMarkAllRead?.(),
      });
    }

    template.push(
      {
        label: '지금 메일 확인',
        click: () => actions.onCheckNow(),
      },
      { type: 'separator' },
      {
        label: '까치 종료',
        click: () => actions.onQuit(),
      }
    );

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: this.mascotWin });
  }

  destroy(): void {
    this.stopCursorTracking();
    if (this.mascotWin && !this.mascotWin.isDestroyed()) {
      this.mascotWin.destroy();
    }
    this.mascotWin = null;
  }
}
