import React, { useEffect, useState } from 'react';
import type { AppSettings, NotificationPayload } from '../../shared/types';
import { CloseIcon, KkachiLogoIcon, TranslateIcon } from './Icons';
import { playAlertSound } from '../utils/sound';

export const AlertPopup: React.FC = () => {
  const [payload, setPayload] = useState<NotificationPayload | null>(null);
  const [progress, setProgress] = useState(100);
  const [theme, setTheme] = useState<AppSettings['theme']>('system');

  useEffect(() => {
    document.documentElement.classList.add('alert-mode');
    document.body.classList.add('alert-mode');

    void window.kkachi.getSettings().then((s) => setTheme(s.theme));
    const unsubSettings = window.kkachi.onSettingsUpdated((s) => setTheme(s.theme));

    const unsubPayload = window.kkachi.onAlertPayload((incoming) => {
      setPayload(incoming);
      setProgress(100);
      if (incoming.soundEnabled) {
        void playAlertSound(incoming.soundPreset, incoming.soundVolume);
      }
    });

    return () => {
      document.documentElement.classList.remove('alert-mode');
      document.body.classList.remove('alert-mode');
      unsubSettings();
      unsubPayload();
    };
  }, []);

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

    applyTheme(theme);

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    return undefined;
  }, [theme]);

  useEffect(() => {
    if (!payload) return;
    const totalMs = Math.max(2, payload.durationSec || 8) * 1000;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.max(0, 100 - (elapsed / totalMs) * 100);
      setProgress(pct);
    }, 100);
    return () => clearInterval(timer);
  }, [payload]);

  if (!payload) {
    return null;
  }

  if (payload.kind === 'status') {
    const statusText = payload.statusMessage || '새 이메일이 없습니다';
    return (
      <div className="alert-wrapper">
        <div
          className="alert-card"
          style={{ borderLeft: '4px solid #6E9BFF' }}
          onClick={() => void window.kkachi.dismissAlertWindow()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              void window.kkachi.dismissAlertWindow();
            }
          }}
        >
          <div className="alert-card-inner">
            <div className="alert-status-row">
              <div className="alert-status-main">
                <KkachiLogoIcon size={18} />
                <span>{statusText}</span>
              </div>
              <button
                type="button"
                className="mini-icon-btn"
                title="닫기"
                onClick={(e) => {
                  e.stopPropagation();
                  void window.kkachi.dismissAlertWindow();
                }}
              >
                <CloseIcon size={13} />
              </button>
            </div>
          </div>

          <div className="alert-progress-track">
            <div
              className="alert-progress-bar"
              style={{
                width: `${progress}%`,
                backgroundColor: '#6E9BFF',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const { email, accountColor } = payload;
  const displaySubject = email.translatedSubject || email.subject;
  const hasTranslation = Boolean(email.translatedSubject && !email.isKorean);

  return (
    <div className="alert-wrapper">
      <div
        className="alert-card"
        style={{ borderLeft: `4px solid ${accountColor || '#6E9BFF'}` }}
        onClick={() => void window.kkachi.openAlertEmail(email.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            void window.kkachi.openAlertEmail(email.id);
          }
        }}
      >
        <div className="alert-card-inner">
          <div className="alert-top-row">
            <div className="alert-sender" title={email.fromAddress}>
              {email.fromName || email.fromAddress}
            </div>
            <button
              type="button"
              className="mini-icon-btn"
              title="알림 닫기"
              onClick={(e) => {
                e.stopPropagation();
                void window.kkachi.dismissAlertWindow();
              }}
            >
              <CloseIcon size={13} />
            </button>
          </div>

          <div className="alert-subject" title={email.subject}>
            {hasTranslation && <TranslateIcon size={12} />}
            <span className="alert-subject-text">{displaySubject}</span>
          </div>
        </div>

        <div className="alert-progress-track">
          <div
            className="alert-progress-bar"
            style={{
              width: `${progress}%`,
              backgroundColor: accountColor || 'var(--accent)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
