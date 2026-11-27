import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccountPublic,
  AppSettings,
  AppUpdateInfo,
  EmailMessage,
  MonitorStatus,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/presets';
import { Sidebar } from './components/Sidebar';
import { EmailList } from './components/EmailList';
import { EmailViewer } from './components/EmailViewer';
import { AccountModal } from './components/AccountModal';
import { SettingsModal } from './components/SettingsModal';
import { SponsorModal } from './components/SponsorModal';
import { UpdateModal } from './components/UpdateModal';

export const App: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>({
    isChecking: false,
    currentAccountId: null,
    currentAccountName: null,
    currentIndex: 0,
    totalAccounts: 0,
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string | 'all'>('all');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [checkedEmailIds, setCheckedEmailIds] = useState<Set<string>>(() => new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountPublic | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const dismissedUpdateVersionRef = useRef<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<AccountPublic | null>(null);
  const [confirmDeleteAllEmails, setConfirmDeleteAllEmails] = useState(false);
  const deleteBackdropMouseDownRef = useRef(false);
  const deleteAllBackdropMouseDownRef = useRef(false);

  const loadData = useCallback(async () => {
    const [accList, emailList, appSettings, status] = await Promise.all([
      window.kkachi.getAccounts(),
      window.kkachi.getEmails(),
      window.kkachi.getSettings(),
      window.kkachi.getMonitorStatus(),
    ]);
    setAccounts(accList);
    setEmails(emailList);
    setSettings(appSettings);
    setMonitorStatus(status);
  }, []);

  useEffect(() => {
    if (navigator.userAgent.includes('Macintosh')) {
      document.body.classList.add('is-darwin');
    }
    void loadData();

    const unsubEmails = window.kkachi.onEmailsUpdated(() => {
      void Promise.all([
        window.kkachi.getAccounts(),
        window.kkachi.getEmails(),
      ]).then(([accList, emailList]) => {
        setAccounts(accList);
        setEmails(emailList);
      });
    });

    const unsubStatus = window.kkachi.onMonitorStatus((status) => {
      setMonitorStatus(status);
    });

    const unsubSettings = window.kkachi.onSettingsUpdated((updated) => {
      setSettings(updated);
    });

    const unsubSelectEmail = window.kkachi.onSelectEmail((emailId) => {
      setSelectedAccountId('all');
      setFilterMode('all');
      setSearchQuery('');
      setSelectedEmailId(emailId);
      setViewerOpen(true);
      void window.kkachi.markEmailRead(emailId, true);
    });

    const unsubUpdate = window.kkachi.onAppUpdateAvailable((info) => {
      setUpdateInfo(info);
      if (info.hasUpdate && dismissedUpdateVersionRef.current !== info.latestVersion) {
        setUpdateModalOpen(true);
      }
    });

    void window.kkachi.checkAppUpdate().then((info) => {
      if (info.hasUpdate) {
        setUpdateInfo(info);
        if (dismissedUpdateVersionRef.current !== info.latestVersion) {
          setUpdateModalOpen(true);
        }
      }
    });

    return () => {
      unsubEmails();
      unsubStatus();
      unsubSettings();
      unsubSelectEmail();
      unsubUpdate();
    };
  }, [loadData]);

  useEffect(() => {
    void window.kkachi.setWindowExpanded(viewerOpen);
  }, [viewerOpen]);

  // Apply theme
  useEffect(() => {
    const applyTheme = (mode: AppSettings['theme']) => {
      if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (mode === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      }
    };

    applyTheme(settings.theme);

    if (settings.theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    return undefined;
  }, [settings.theme]);

  const accountScopedEmails = useMemo(
    () =>
      selectedAccountId === 'all'
        ? emails
        : emails.filter((email) => email.accountId === selectedAccountId),
    [emails, selectedAccountId]
  );

  const accountUnreadCount = useMemo(
    () => accountScopedEmails.filter((email) => !email.isRead).length,
    [accountScopedEmails]
  );

  const filteredEmails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accountScopedEmails.filter((email) => {
      if (filterMode === 'unread' && email.isRead) {
        return false;
      }
      if (!q) return true;
      return (
        email.subject.toLowerCase().includes(q) ||
        (email.translatedSubject?.toLowerCase().includes(q) ?? false) ||
        email.fromName.toLowerCase().includes(q) ||
        email.fromAddress.toLowerCase().includes(q) ||
        email.snippet.toLowerCase().includes(q) ||
        (email.translatedText?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [accountScopedEmails, filterMode, searchQuery]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedEmailId) ?? null,
    [emails, selectedEmailId]
  );

  const selectedEmailAccount = useMemo(
    () => accounts.find((a) => a.id === selectedEmail?.accountId),
    [accounts, selectedEmail]
  );

  const activeAccount =
    selectedAccountId === 'all'
      ? null
      : accounts.find((a) => a.id === selectedAccountId) ?? null;

  const listTitle = activeAccount
    ? activeAccount.name || activeAccount.email
    : '전체 받은편지함';

  const handleSelectEmail = (email: EmailMessage) => {
    setSelectedEmailId(email.id);
    setViewerOpen(true);
    if (!email.isRead) {
      void window.kkachi.markEmailRead(email.id, true);
    }
  };

  const handleToggleRead = (emailId: string, isRead: boolean) => {
    void window.kkachi.markEmailRead(emailId, isRead);
  };

  const handleDeleteEmail = (emailId: string) => {
    if (selectedEmailId === emailId) {
      setSelectedEmailId(null);
    }
    setCheckedEmailIds((prev) => {
      if (!prev.has(emailId)) return prev;
      const next = new Set(prev);
      next.delete(emailId);
      return next;
    });
    void window.kkachi.deleteEmail(emailId);
  };

  const handleToggleCheckEmail = (emailId: string) => {
    setCheckedEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const handleToggleCheckAllVisible = (visibleEmailIds: string[], checked: boolean) => {
    setCheckedEmailIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleEmailIds) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const handleDeleteSelectedEmails = () => {
    const ids = Array.from(checkedEmailIds);
    if (ids.length === 0) return;
    if (selectedEmailId && checkedEmailIds.has(selectedEmailId)) {
      setSelectedEmailId(null);
    }
    setCheckedEmailIds(new Set());
    void window.kkachi.deleteEmails(ids);
  };

  const handleDeleteAllEmailsConfirmed = async () => {
    const scopeAccountId = selectedAccountId === 'all' ? undefined : selectedAccountId;
    setConfirmDeleteAllEmails(false);
    setCheckedEmailIds(new Set());
    if (
      selectedEmailId &&
      accountScopedEmails.some((email) => email.id === selectedEmailId)
    ) {
      setSelectedEmailId(null);
    }
    await window.kkachi.deleteAllEmails(scopeAccountId);
  };

  useEffect(() => {
    setCheckedEmailIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(accountScopedEmails.map((e) => e.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [accountScopedEmails]);

  const handleTranslateEmail = async (emailId: string, force = false) => {
    await window.kkachi.translateEmail(emailId, force);
  };

  const handleToggleSound = async () => {
    const updated = await window.kkachi.saveSettings({
      soundEnabled: !settings.soundEnabled,
    });
    setSettings(updated);
  };

  const handleDeleteAccountConfirmed = async () => {
    if (!confirmDeleteAccount) return;
    const idToDelete = confirmDeleteAccount.id;
    setConfirmDeleteAccount(null);
    if (selectedAccountId === idToDelete) {
      setSelectedAccountId('all');
    }
    await window.kkachi.deleteAccount(idToDelete);
    await loadData();
  };

  return (
    <div className={`app-shell ${viewerOpen ? '' : 'viewer-collapsed'}`}>
      <Sidebar
        accounts={accounts}
        emails={emails}
        selectedAccountId={selectedAccountId}
        monitorStatus={monitorStatus}
        soundEnabled={settings.soundEnabled}
        onSelectAccount={(id) => {
          setSelectedAccountId(id);
          setSelectedEmailId(null);
          setCheckedEmailIds(new Set());
          setViewerOpen(false);
        }}
        onAddAccount={() => {
          setEditingAccount(null);
          setAccountModalOpen(true);
        }}
        onEditAccount={(acc) => {
          setEditingAccount(acc);
          setAccountModalOpen(true);
        }}
        onDeleteAccount={(acc) => setConfirmDeleteAccount(acc)}
        onCheckNow={() => void window.kkachi.checkNow()}
        onToggleSound={() => void handleToggleSound()}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSponsor={() => setSponsorModalOpen(true)}
        updateVersion={updateInfo?.hasUpdate ? updateInfo.latestVersion : null}
        onOpenUpdate={() => setUpdateModalOpen(true)}
      />

      <EmailList
        title={listTitle}
        emails={filteredEmails}
        totalCount={accountScopedEmails.length}
        unreadCount={accountUnreadCount}
        accounts={accounts}
        selectedEmailId={selectedEmailId}
        checkedEmailIds={checkedEmailIds}
        viewerOpen={viewerOpen}
        searchQuery={searchQuery}
        filterMode={filterMode}
        onSearchChange={setSearchQuery}
        onFilterModeChange={setFilterMode}
        onSelectEmail={handleSelectEmail}
        onToggleCheckEmail={handleToggleCheckEmail}
        onToggleCheckAllVisible={handleToggleCheckAllVisible}
        onClearChecked={() => setCheckedEmailIds(new Set())}
        onDeleteSelectedEmails={handleDeleteSelectedEmails}
        onRequestDeleteAllEmails={() => setConfirmDeleteAllEmails(true)}
        onToggleRead={handleToggleRead}
        onMarkAllRead={() =>
          void window.kkachi.markAllRead(
            selectedAccountId === 'all' ? undefined : selectedAccountId
          )
        }
        onToggleViewer={() => setViewerOpen((prev) => !prev)}
      />

      {viewerOpen && (
        <EmailViewer
          email={selectedEmail}
          account={selectedEmailAccount}
          onToggleRead={handleToggleRead}
          onDelete={handleDeleteEmail}
          onTranslate={handleTranslateEmail}
          onCloseViewer={() => setViewerOpen(false)}
        />
      )}

      {accountModalOpen && (
        <AccountModal
          initialAccount={editingAccount}
          accountCount={accounts.length}
          onClose={() => setAccountModalOpen(false)}
          onSaved={() => {
            void loadData();
            void window.kkachi.checkNow();
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setSettings(updated)}
          onOpenUpdate={(info) => {
            setUpdateInfo(info);
            setUpdateModalOpen(true);
          }}
        />
      )}

      {sponsorModalOpen && (
        <SponsorModal onClose={() => setSponsorModalOpen(false)} />
      )}

      {updateModalOpen && updateInfo && (
        <UpdateModal
          info={updateInfo}
          onClose={() => {
            dismissedUpdateVersionRef.current = updateInfo.latestVersion;
            setUpdateModalOpen(false);
          }}
        />
      )}

      {confirmDeleteAllEmails && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            deleteAllBackdropMouseDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (deleteAllBackdropMouseDownRef.current && e.target === e.currentTarget) {
              setConfirmDeleteAllEmails(false);
            }
            deleteAllBackdropMouseDownRef.current = false;
          }}
        >
          <div
            className="modal-card"
            style={{ maxWidth: '400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>모든 이메일 삭제</h2>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong>{listTitle}</strong>의 이메일{' '}
                <strong>{accountScopedEmails.length}통</strong>을 까치에서 모두 삭제하시겠습니까?
                <br />
                (실제 메일 서버의 이메일은 삭제되지 않습니다.)
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmDeleteAllEmails(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--danger)' }}
                onClick={() => void handleDeleteAllEmailsConfirmed()}
              >
                모두 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteAccount && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            deleteBackdropMouseDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (deleteBackdropMouseDownRef.current && e.target === e.currentTarget) {
              setConfirmDeleteAccount(null);
            }
            deleteBackdropMouseDownRef.current = false;
          }}
        >
          <div
            className="modal-card"
            style={{ maxWidth: '400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>계정 삭제</h2>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
                <strong>
                  {confirmDeleteAccount.name || confirmDeleteAccount.email}
                </strong>{' '}
                계정과 동기화된 메일 목록을 까치에서 삭제하시겠습니까?
                <br />
                (실제 메일 서버의 이메일은 삭제되지 않습니다.)
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmDeleteAccount(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--danger)' }}
                onClick={() => void handleDeleteAccountConfirmed()}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
