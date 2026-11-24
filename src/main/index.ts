import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { AppStore } from './store';
import { MailMonitor } from './mail/monitor';
import {
  AlertWindowManager,
  COMPACT_WINDOW_WIDTH,
  EXPANDED_WINDOW_WIDTH,
  MascotWindowManager,
  createMainWindow,
  type WindowSizeState,
} from './windows';
import { TrayManager } from './tray';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
const isQuittingRef = { current: false };

process.on('uncaughtException', (err) => {
  console.error('[Kkachi] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Kkachi] Unhandled rejection:', reason);
});

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setName('Kkachi');

    const preloadPath = path.join(__dirname, '../preload/index.cjs');
    const store = new AppStore(path.join(app.getPath('userData'), 'kkachi-data.json'));

    const initialSettings = store.getSettings();
    const mascotManager = new MascotWindowManager(
      preloadPath,
      store.getUnreadCount(),
      initialSettings.mascotPosition,
      initialSettings.mascotFlightMode,
      initialSettings.mascotFlightIntervalSec
    );
    const windowSizeState: WindowSizeState = {
      expanded: false,
      compactWidth: COMPACT_WINDOW_WIDTH,
      expandedWidth: EXPANDED_WINDOW_WIDTH,
    };

    const createManagedMainWindow = (showOnReady: boolean): BrowserWindow => {
      windowSizeState.expanded = false;
      const win = createMainWindow(preloadPath, store, isQuittingRef, showOnReady);
      win.on('show', () => {
        mascotManager.updateState({ hasNewAlert: false });
      });
      return win;
    };

    const openMainWindow = (emailId?: string) => {
      mascotManager.updateState({ hasNewAlert: false });

      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createManagedMainWindow(true);
        if (emailId) {
          const targetWin = mainWindow;
          targetWin.webContents.once('did-finish-load', () => {
            if (!targetWin.isDestroyed()) {
              targetWin.webContents.send('email:select', emailId);
            }
          });
        }
        return;
      }

      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      if (emailId) {
        mainWindow.webContents.send('email:select', emailId);
      }
    };

    const alertManager = new AlertWindowManager(
      preloadPath,
      store,
      (emailId) => {
        openMainWindow(emailId);
      },
      () => mascotManager.getBounds()
    );

    mascotManager.setOnMove(() => {
      alertManager.repositionIfVisible();
    });

    let trayManager: TrayManager | null = null;

    const quitApp = () => {
      isQuittingRef.current = true;
      monitor.stop();
      alertManager.destroy();
      mascotManager.destroy();
      trayManager?.destroy();
      app.quit();
    };

    const monitor = new MailMonitor(store, {
      onStatusChange: (status) => {
        mascotManager.updateState({ isChecking: status.isChecking });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('monitor:status', status);
        }
      },
      onEmailsUpdated: () => {
        trayManager?.refresh();
        mascotManager.updateState({ unreadCount: store.getUnreadCount() });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emails:updated');
        }
      },
      onNewEmail: (payload) => {
        mascotManager.updateState({
          unreadCount: store.getUnreadCount(),
          hasNewAlert: true,
          latestEmailId: payload.email.id,
          latestEmailSubject: payload.email.translatedSubject || payload.email.subject,
          latestFromName: payload.email.fromName,
        });
        alertManager.enqueue(payload);
      },
    });

    trayManager = new TrayManager(
      store,
      monitor,
      () => mainWindow,
      quitApp
    );

    // Keep main inbox window hidden on startup; show only the floating Kkachi mascot
    mainWindow = createManagedMainWindow(false);
    mascotManager.init();
    trayManager.init();

    registerIpcHandlers({
      store,
      monitor,
      alertManager,
      mascotManager,
      trayManager,
      windowSizeState,
      getMainWindow: () => mainWindow,
      openMainWindow,
      quitApp,
    });

    monitor.start();

    app.on('activate', () => {
      openMainWindow();
    });

    app.on('before-quit', () => {
      isQuittingRef.current = true;
      monitor.stop();
      alertManager.destroy();
      mascotManager.destroy();
      trayManager?.destroy();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin' && !store.getSettings().minimizeToTrayOnClose) {
        app.quit();
      }
    });
  });
}
