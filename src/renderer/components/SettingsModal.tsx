import React, { useRef, useState } from 'react';
import type {
  AppSettings,
  MascotPosition,
  SoundPreset,
  ThemeMode,
  TranslationProvider,
} from '../../shared/types';
import {
  BellIcon,
  CloseIcon,
  MoonIcon,
  SunIcon,
  TranslateIcon,
  VolumeOnIcon,
} from './Icons';
import { playAlertSound } from '../utils/sound';

interface SettingsModalProps {
  settings: AppSettings;
  onClose: () => void;
  onSaved: (updated: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [saving, setSaving] = useState(false);
  const backdropMouseDownRef = useRef(false);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await window.kkachi.saveSettings(draft);
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    await window.kkachi.saveSettings(draft);
    onSaved(draft);
    await window.kkachi.testAlert();
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSave(e)}
      >
        <div className="modal-header">
          <h2>환경설정</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <div className="form-section-title">
              <BellIcon size={14} />
              모니터링 및 알림
            </div>

            <div className="form-row-2">
              <div className="field">
                <label>순차 확인 주기 (초)</label>
                <input
                  type="number"
                  min={15}
                  max={3600}
                  className="input-field"
                  value={draft.pollIntervalSec}
                  onChange={(e) => update('pollIntervalSec', Number(e.target.value) || 60)}
                />
              </div>
              <div className="field">
                <label>알림창 표시 시간 (초)</label>
                <input
                  type="number"
                  min={3}
                  max={30}
                  className="input-field"
                  value={draft.alertDurationSec}
                  onChange={(e) => update('alertDurationSec', Number(e.target.value) || 8)}
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="field">
                <label>알림음 스타일</label>
                <select
                  className="input-field"
                  value={draft.soundPreset}
                  onChange={(e) => update('soundPreset', e.target.value as SoundPreset)}
                >
                  <option value="kkachi">까치 울음벨 (기본)</option>
                  <option value="chime">맑은 차임</option>
                  <option value="soft">부드러운 알림</option>
                </select>
              </div>
              <div className="field">
                <label>알림음 크기 ({Math.round(draft.soundVolume * 100)}%)</label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={draft.soundVolume}
                  onChange={(e) => update('soundVolume', Number(e.target.value))}
                  style={{ marginTop: '8px' }}
                />
              </div>
            </div>

            <div className="checkbox-row">
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={draft.soundEnabled}
                  onChange={(e) => update('soundEnabled', e.target.checked)}
                />
                새 메일 도착 시 알림음 재생
              </label>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => void playAlertSound(draft.soundPreset, draft.soundVolume)}
              >
                <VolumeOnIcon size={14} />
                소리 미리듣기
              </button>
            </div>

            <div className="checkbox-row">
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={draft.alertPopupEnabled}
                  onChange={(e) => update('alertPopupEnabled', e.target.checked)}
                />
                까치 플로팅 알림창 표시
              </label>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => void handleTestNotification()}
              >
                <BellIcon size={14} />
                알림창 테스트
              </button>
            </div>

            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={draft.nativeNotificationEnabled}
                onChange={(e) => update('nativeNotificationEnabled', e.target.checked)}
              />
              운영체제(macOS/Windows) 기본 알림도 함께 사용
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-title">
              <TranslateIcon size={14} />
              자동 한국어 번역
            </div>

            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={draft.autoTranslate}
                onChange={(e) => update('autoTranslate', e.target.checked)}
              />
              한국어가 아닌 이메일 수신 시 자동으로 번역하기
            </label>

            <div className="field">
              <label>번역 엔진</label>
              <select
                className="input-field"
                value={draft.translationProvider}
                onChange={(e) =>
                  update('translationProvider', e.target.value as TranslationProvider)
                }
              >
                <option value="google-free">무료 자동 번역 (API 키 불필요)</option>
                <option value="deepl">DeepL API (고품질 번역)</option>
                <option value="openai">OpenAI GPT API</option>
              </select>
            </div>

            {draft.translationProvider === 'deepl' && (
              <div className="field">
                <label>DeepL API Key</label>
                <input
                  type="password"
                  className="input-field"
                  value={draft.deeplApiKey}
                  onChange={(e) => update('deeplApiKey', e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                />
              </div>
            )}

            {draft.translationProvider === 'openai' && (
              <div className="form-row-2">
                <div className="field">
                  <label>OpenAI API Key</label>
                  <input
                    type="password"
                    className="input-field"
                    value={draft.openaiApiKey}
                    onChange={(e) => update('openaiApiKey', e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
                <div className="field">
                  <label>모델</label>
                  <input
                    type="text"
                    className="input-field"
                    value={draft.openaiModel}
                    onChange={(e) => update('openaiModel', e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="form-section-title">
              {draft.theme === 'dark' ? <MoonIcon size={14} /> : <SunIcon size={14} />}
              화면 및 창 동작
            </div>

            <div className="form-row-2">
              <div className="field">
                <label>테마</label>
                <select
                  className="input-field"
                  value={draft.theme}
                  onChange={(e) => update('theme', e.target.value as ThemeMode)}
                >
                  <option value="system">시스템 설정 따르기</option>
                  <option value="light">라이트 모드</option>
                  <option value="dark">다크 모드</option>
                </select>
              </div>
              <div className="field">
                <label>초기 동기화 메일 수</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  className="input-field"
                  value={draft.initialFetchCount}
                  onChange={(e) => update('initialFetchCount', Number(e.target.value) || 15)}
                />
              </div>
            </div>

            <div className="field">
              <label>까치 위젯 초기 위치</label>
              <select
                className="input-field"
                value={draft.mascotPosition}
                onChange={(e) => update('mascotPosition', e.target.value as MascotPosition)}
              >
                <option value="top-left">화면 왼쪽 위 (기본)</option>
                <option value="top-right">화면 오른쪽 위</option>
                <option value="bottom-left">화면 왼쪽 아래</option>
                <option value="bottom-right">화면 오른쪽 아래</option>
              </select>
            </div>

            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={draft.minimizeToTrayOnClose}
                onChange={(e) => update('minimizeToTrayOnClose', e.target.checked)}
              />
              창 닫기 시 종료하지 않고 메뉴바/트레이에서 계속 모니터링
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            까치 (Kkachi) v1.0.0
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
