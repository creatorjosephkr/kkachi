import React from 'react';
import type { AccountPublic, EmailMessage } from '../../shared/types';
import {
  CheckDoubleIcon,
  MailIcon,
  MailOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SearchIcon,
  TrashIcon,
} from './Icons';

interface EmailListProps {
  title: string;
  emails: EmailMessage[];
  totalCount: number;
  unreadCount: number;
  accounts: AccountPublic[];
  selectedEmailId: string | null;
  checkedEmailIds: Set<string>;
  viewerOpen: boolean;
  searchQuery: string;
  filterMode: 'all' | 'unread';
  onSearchChange: (q: string) => void;
  onFilterModeChange: (mode: 'all' | 'unread') => void;
  onSelectEmail: (email: EmailMessage) => void;
  onToggleCheckEmail: (emailId: string) => void;
  onToggleCheckAllVisible: (visibleEmailIds: string[], checked: boolean) => void;
  onClearChecked: () => void;
  onDeleteSelectedEmails: () => void;
  onRequestDeleteAllEmails: () => void;
  onToggleRead: (emailId: string, isRead: boolean) => void;
  onMarkAllRead: () => void;
  onToggleViewer: () => void;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthDay = `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (date.getFullYear() === now.getFullYear()) {
    return `${monthDay} ${time}`;
  }
  return `${date.getFullYear()}.${monthDay} ${time}`;
}

export const EmailList: React.FC<EmailListProps> = ({
  title,
  emails,
  totalCount,
  unreadCount,
  accounts,
  selectedEmailId,
  checkedEmailIds,
  viewerOpen,
  searchQuery,
  filterMode,
  onSearchChange,
  onFilterModeChange,
  onSelectEmail,
  onToggleCheckEmail,
  onToggleCheckAllVisible,
  onClearChecked,
  onDeleteSelectedEmails,
  onRequestDeleteAllEmails,
  onToggleRead,
  onMarkAllRead,
  onToggleViewer,
}) => {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const visibleIds = emails.map((e) => e.id);
  const checkedVisibleCount = visibleIds.filter((id) => checkedEmailIds.has(id)).length;
  const allVisibleChecked = visibleIds.length > 0 && checkedVisibleCount === visibleIds.length;

  return (
    <section className="email-list-pane">
      <div className="list-toolbar">
        <div className="list-title-row">
          <span className="list-title">{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '4px 8px', fontSize: '11.5px' }}
                title="모두 읽음으로 표시"
                onClick={onMarkAllRead}
              >
                <CheckDoubleIcon size={14} />
                모두 읽음
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              title={viewerOpen ? '이메일 내용 영역 닫기' : '이메일 내용 영역 열기'}
              onClick={onToggleViewer}
            >
              {viewerOpen ? (
                <PanelRightCloseIcon size={16} />
              ) : (
                <PanelRightOpenIcon size={16} />
              )}
            </button>
          </div>
        </div>

        <div className="search-box">
          <SearchIcon size={15} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="보낸 사람, 제목 검색..."
          />
        </div>

        <div className="filter-tabs">
          <div className="segmented">
            <button
              type="button"
              className={filterMode === 'all' ? 'active' : ''}
              onClick={() => onFilterModeChange('all')}
            >
              전체 ({totalCount})
            </button>
            <button
              type="button"
              className={filterMode === 'unread' ? 'active' : ''}
              onClick={() => onFilterModeChange('unread')}
            >
              안 읽음 ({unreadCount})
            </button>
          </div>
          {totalCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              style={{ padding: '4px 8px', fontSize: '11.5px' }}
              title="현재 받은편지함의 모든 이메일 삭제"
              onClick={onRequestDeleteAllEmails}
            >
              <TrashIcon size={13} />
              전체 삭제
            </button>
          )}
        </div>

        {totalCount > 0 && (
          <div className="list-selection-bar">
            <div className="selection-bar-left">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11.5px' }}
                disabled={visibleIds.length === 0}
                onClick={() => onToggleCheckAllVisible(visibleIds, !allVisibleChecked)}
              >
                {allVisibleChecked ? '전체 해제' : '전체 선택'}
              </button>
              {checkedEmailIds.size > 0 && (
                <span className="selection-count-label">{checkedEmailIds.size}개 선택</span>
              )}
            </div>
            <div className="selection-bar-actions">
              {checkedEmailIds.size > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-danger-soft"
                    style={{ padding: '3px 9px', fontSize: '11.5px' }}
                    onClick={onDeleteSelectedEmails}
                  >
                    <TrashIcon size={13} />
                    선택 삭제
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '3px 7px', fontSize: '11.5px' }}
                    onClick={onClearChecked}
                  >
                    해제
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="email-list-scroll">
        {emails.length === 0 ? (
          <div className="empty-state">
            <MailIcon size={32} />
            <h3>표시할 메일이 없습니다</h3>
            <p>
              {accounts.length === 0
                ? '좌측 하단의 "계정 추가" 버튼으로 이메일 계정을 등록해 주세요.'
                : '새로운 이메일이 도착하면 까치가 알림과 함께 이곳에 표시합니다.'}
            </p>
          </div>
        ) : (
          emails.map((email) => {
            const acc = accountMap.get(email.accountId);
            const isSelected = email.id === selectedEmailId;
            const isChecked = checkedEmailIds.has(email.id);

            return (
              <div
                key={email.id}
                role="button"
                tabIndex={0}
                className={`email-row ${email.isRead ? '' : 'unread'} ${
                  isSelected ? 'selected' : ''
                } ${isChecked ? 'checked' : ''}`}
                onClick={() => onSelectEmail(email)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectEmail(email);
                  }
                }}
              >
                <label
                  className="email-checkbox-wrap"
                  title="이메일 선택"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="email-checkbox"
                    checked={isChecked}
                    onChange={() => onToggleCheckEmail(email.id)}
                    aria-label={`${email.subject} 선택`}
                  />
                </label>

                <div className="email-row-main">
                  <div className="email-row-top">
                    <div className="email-sender">
                      <span
                        className="account-dot"
                        style={{ backgroundColor: acc?.color || '#64748b' }}
                        title={acc?.name || acc?.email}
                      />
                      <span className="email-sender-name">{email.fromName}</span>
                    </div>
                    <span className="email-date">{formatDateTime(email.date)}</span>
                  </div>

                  <div className="email-row-bottom">
                    <div className="email-subject" title={email.subject}>
                      {email.subject}
                    </div>
                    <button
                      type="button"
                      className={`mini-icon-btn email-read-btn ${
                        email.isRead ? 'is-read' : 'is-unread'
                      }`}
                      title={email.isRead ? '안 읽음으로 표시' : '읽음으로 표시'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRead(email.id, !email.isRead);
                      }}
                    >
                      {email.isRead ? <MailIcon size={13} /> : <MailOpenIcon size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
