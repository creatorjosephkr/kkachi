import path from 'node:path';
import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import type { AppStore } from './store';
import type { MailMonitor } from './mail/monitor';

export class TrayManager {
  private tray: Tray | null = null;
  private readonly store: AppStore;
  private readonly monitor: MailMonitor;
  private readonly getMainWindow: () => BrowserWindow | null;
  private readonly onQuit: () => void;

  constructor(
    store: AppStore,
    monitor: MailMonitor,
    getMainWindow: () => BrowserWindow | null,
    onQuit: () => void
  ) {
    this.store = store;
    this.monitor = monitor;
    this.getMainWindow = getMainWindow;
    this.onQuit = onQuit;
  }

  init(): void {
    const iconFile =
      process.platform === 'darwin'
        ? path.join(__dirname, '../../build/trayTemplate.png')
        : path.join(__dirname, '../../build/tray.png');

    const icon = nativeImage.createFromPath(iconFile);
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('까치 (Kkachi) - 이메일 모니터');
    this.tray.on('click', () => {
      this.showMainWindow();
    });

    this.refresh();
  }

  refresh(): void {
    if (!this.tray) return;

    const unread = this.store.getUnreadCount();
    const settings = this.store.getSettings();

    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(unread);
    }

    this.tray.setToolTip(
      unread > 0
        ? `까치 (Kkachi) · 안 읽은 메일 ${unread}통`
        : '까치 (Kkachi) · 새 메일 대기 중'
    );

    const contextMenu = Menu.buildFromTemplate([
      {
        label: unread > 0 ? `까치 열기 (안 읽은 메일 ${unread}통)` : '까치 열기',
        click: () => this.showMainWindow(),
      },
      {
        label: '지금 메일 확인',
        click: () => {
          void this.monitor.checkNow();
        },
      },
      { type: 'separator' },
      {
        label: '알림음 켜기',
        type: 'checkbox',
        checked: settings.soundEnabled,
        click: (menuItem) => {
          const updated = this.store.saveSettings({ soundEnabled: menuItem.checked });
          const win = this.getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('settings:updated', updated);
          }
          this.refresh();
        },
      },
      { type: 'separator' },
      {
        label: '까치 종료',
        click: () => this.onQuit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private showMainWindow(): void {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
