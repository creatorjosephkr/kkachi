import React from 'react';
import sponIconUrl from '../../../spon/spon.svg';
import type {
  AccountPublic,
  EmailMessage,
  MonitorStatus,
} from '../../shared/types';
import {
  AlertCircleIcon,
  EditIcon,
  InboxIcon,
  KkachiLogoIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  TrashIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from './Icons';

interface SidebarProps {
  accounts: AccountPublic[];
  emails: EmailMessage[];
  selectedAccountId: string | 'all';
  monitorStatus: MonitorStatus;
  soundEnabled: boolean;
  onSelectAccount: (accountId: string | 'all') => void;
  onAddAccount: () => void;
  onEditAccount: (account: AccountPublic) => void;
  onDeleteAccount: (account: AccountPublic) => void;
  onCheckNow: () => void;
  onToggleSound: () => void;
  onOpenSettings: () => void;
  onOpenSponsor: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  accounts,
  emails,
  selectedAccountId,
  monitorStatus,
  soundEnabled,
  onSelectAccount,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onCheckNow,
  onToggleSound,
  onOpenSettings,
  onOpenSponsor,
}) => {
  const totalUnread = emails.filter((e) => !e.isRead).length;

  const getUnreadForAccount = (accountId: string) =>
    emails.filter((e) => e.accountId === accountId && !e.isRead).length;

  const statusText = monitorStatus.isChecking
    ? `순차 확인 (${monitorStatus.currentIndex}/${monitorStatus.totalAccounts}): ${monitorStatus.currentAccountName}`
    : accounts.length === 0
      ? '등록된 계정이 없습니다'
      : monitorStatus.lastCycleCompletedAt
        ? `최근 확인 ${new Date(monitorStatus.lastCycleCompletedAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : '모니터링 대기 중';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <KkachiLogoIcon size={30} />
          <div className="brand-title">
            <span className="brand-name">까치</span>
            <span className="brand-sub">Kkachi Mail</span>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            title={soundEnabled ? '알림음 켜짐 (클릭하여 끄기)' : '알림음 꺼짐 (클릭하여 켜기)'}
            onClick={onToggleSound}
          >
            {soundEnabled ? <VolumeOnIcon size={16} /> : <VolumeOffIcon size={16} />}
          </button>
          <button
            type="button"
            className={`icon-btn ${monitorStatus.isChecking ? 'spinning' : ''}`}
            title="지금 모든 계정 순차 확인"
            onClick={onCheckNow}
            disabled={monitorStatus.isChecking}
          >
            <RefreshIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="환경설정"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`nav-item ${selectedAccountId === 'all' ? 'active' : ''}`}
          onClick={() => onSelectAccount('all')}
        >
          <div className="nav-item-main">
            <InboxIcon size={17} />
            <div className="nav-item-text">
              <span className="nav-item-title">전체 받은편지함</span>
            </div>
          </div>
          {totalUnread > 0 && <span className="unread-pill">{totalUnread}</span>}
        </button>

        <div className="status-bar sidebar-status-inline" title={statusText}>
          <span
            className={`account-dot ${monitorStatus.isChecking ? 'checking' : ''}`}
            style={{
              backgroundColor: monitorStatus.isChecking ? 'var(--accent)' : 'var(--success)',
            }}
          />
          <span className="status-bar-text">{statusText}</span>
        </div>

        <div className="nav-section-header">
          <span>이메일 계정 ({accounts.length})</span>
          <button
            type="button"
            className="mini-icon-btn"
            title="이메일 계정 추가"
            onClick={onAddAccount}
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {accounts.length === 0 ? (
          <div
            style={{
              padding: '12px 10px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            2개 이상의 계정을 등록하면 순서대로 새 메일을 감시합니다.
          </div>
        ) : (
          accounts.map((acc) => {
            const unread = getUnreadForAccount(acc.id);
            const isCurrentlyChecking =
              monitorStatus.isChecking && monitorStatus.currentAccountId === acc.id;

            return (
              <div
                key={acc.id}
                className={`nav-item ${selectedAccountId === acc.id ? 'active' : ''}`}
                onClick={() => onSelectAccount(acc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectAccount(acc.id);
                  }
                }}
              >
                <div className="nav-item-main">
                  <span
                    className={`account-dot ${isCurrentlyChecking ? 'checking' : ''}`}
                    style={{
                      backgroundColor: acc.enabled ? acc.color : 'var(--text-muted)',
                      opacity: acc.enabled ? 1 : 0.45,
                    }}
                  />
                  <div className="nav-item-text">
                    <span className="nav-item-title">{acc.name || acc.email}</span>
                    <span className="nav-item-sub">
                      <span className="proto-tag">{acc.protocol}</span>
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {acc.email}
                      </span>
                    </span>
                  </div>
                </div>

                {acc.lastError && (
                  <span className="error-dot" title={acc.lastError}>
                    <AlertCircleIcon size={14} />
                  </span>
                )}

                {unread > 0 && (
                  <span className="unread-pill hide-on-hover">{unread}</span>
                )}

                <div className="account-row-actions">
                  <button
                    type="button"
                    className="mini-icon-btn"
                    title="계정 편집"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditAccount(acc);
                    }}
                  >
                    <EditIcon size={13} />
                  </button>
                  <button
                    type="button"
                    className="mini-icon-btn danger"
                    title="계정 삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAccount(acc);
                    }}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sponsor-row">
          <button
            type="button"
            className="sponsor-btn"
            title="개발자 후원하기"
            aria-label="개발자 후원하기"
            onClick={onOpenSponsor}
          >
            <img
              src={sponIconUrl}
              alt="개발자 후원하기"
              className="sponsor-icon-img"
              draggable={false}
            />
          </button>
        </div>

        <div className="sidebar-footer-btns">
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={onAddAccount}
          >
            <PlusIcon size={15} />
            계정 추가
          </button>
        </div>
      </div>
    </aside>
  );
};
