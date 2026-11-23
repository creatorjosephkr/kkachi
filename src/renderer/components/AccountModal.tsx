import React, { useRef, useState } from 'react';
import type {
  AccountInput,
  AccountPublic,
  MailProtocol,
} from '../../shared/types';
import { ACCOUNT_COLORS, MAIL_PROVIDER_PRESETS } from '../../shared/presets';
import {
  AlertCircleIcon,
  CheckIcon,
  CloseIcon,
  MailIcon,
  SendIcon,
  ServerIcon,
} from './Icons';

interface AccountModalProps {
  initialAccount: AccountPublic | null;
  accountCount: number;
  onClose: () => void;
  onSaved: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  initialAccount,
  accountCount,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialAccount);
  const defaultPreset = MAIL_PROVIDER_PRESETS[0];
  const backdropMouseDownRef = useRef(false);

  const [presetId, setPresetId] = useState<string>(isEditing ? 'custom' : defaultPreset.id);
  const [name, setName] = useState(initialAccount?.name ?? '');
  const [email, setEmail] = useState(initialAccount?.email ?? '');
  const [protocol, setProtocol] = useState<MailProtocol>(
    initialAccount?.protocol ?? 'imap'
  );
  const [host, setHost] = useState(initialAccount?.host ?? defaultPreset.imapHost);
  const [port, setPort] = useState(initialAccount?.port ?? defaultPreset.imapPort);
  const [secure, setSecure] = useState(initialAccount?.secure ?? defaultPreset.imapSecure);
  const [starttls, setStarttls] = useState(initialAccount?.starttls ?? false);
  const [username, setUsername] = useState(initialAccount?.username ?? '');
  const [password, setPassword] = useState('');
  const [smtpHost, setSmtpHost] = useState(
    initialAccount?.smtpHost ?? defaultPreset.smtpHost
  );
  const [smtpPort, setSmtpPort] = useState(
    initialAccount?.smtpPort ?? defaultPreset.smtpPort
  );
  const [smtpSecure, setSmtpSecure] = useState(
    initialAccount?.smtpSecure ?? defaultPreset.smtpSecure
  );
  const [enabled, setEnabled] = useState(initialAccount?.enabled ?? true);
  const [color, setColor] = useState(
    initialAccount?.color ?? ACCOUNT_COLORS[accountCount % ACCOUNT_COLORS.length]
  );

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const activePreset = MAIL_PROVIDER_PRESETS.find((p) => p.id === presetId);

  const applyPreset = (newPresetId: string, targetProto: MailProtocol = protocol) => {
    setPresetId(newPresetId);
    const preset = MAIL_PROVIDER_PRESETS.find((p) => p.id === newPresetId);
    if (!preset || preset.id === 'custom') return;

    if (targetProto === 'pop3') {
      setHost(preset.pop3Host);
      setPort(preset.pop3Port);
      setSecure(preset.pop3Secure);
      setStarttls(!preset.pop3Secure);
    } else {
      setHost(preset.imapHost);
      setPort(preset.imapPort);
      setSecure(preset.imapSecure);
      setStarttls(false);
    }
    setSmtpHost(preset.smtpHost);
    setSmtpPort(preset.smtpPort);
    setSmtpSecure(preset.smtpSecure);
  };

  const handleProtocolChange = (nextProto: MailProtocol) => {
    setProtocol(nextProto);
    if (presetId !== 'custom') {
      applyPreset(presetId, nextProto);
      return;
    }

    const normalizedHost = host.trim().toLowerCase();
    const matched = MAIL_PROVIDER_PRESETS.find(
      (p) =>
        p.id !== 'custom' &&
        (p.imapHost.toLowerCase() === normalizedHost || p.pop3Host.toLowerCase() === normalizedHost)
    );
    if (matched) {
      if (nextProto === 'pop3') {
        setHost(matched.pop3Host);
        setPort(matched.pop3Port);
        setSecure(matched.pop3Secure);
        setStarttls(!matched.pop3Secure);
      } else {
        setHost(matched.imapHost);
        setPort(matched.imapPort);
        setSecure(matched.imapSecure);
        setStarttls(false);
      }
      return;
    }

    if (nextProto === 'pop3') {
      if (/^imap\./i.test(host.trim())) {
        setHost(host.trim().replace(/^imap\./i, 'pop.'));
      }
      if (Number(port) === 993) setPort(995);
    } else {
      if (/^pop\./i.test(host.trim())) {
        setHost(host.trim().replace(/^pop\./i, 'imap.'));
      }
      if (Number(port) === 995) setPort(993);
    }
  };

  const buildPayload = (): AccountInput => ({
    id: initialAccount?.id,
    name: name.trim() || email.trim(),
    email: email.trim(),
    protocol,
    host: host.trim(),
    port: Number(port) || (protocol === 'pop3' ? 995 : 993),
    secure,
    starttls,
    username: username.trim() || email.trim(),
    password,
    smtpHost: smtpHost.trim(),
    smtpPort: Number(smtpPort) || 465,
    smtpSecure,
    enabled,
    color,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await window.kkachi.testAccountConnection(buildPayload());
      setTestResult({ ok: res.ok, text: res.message });
    } catch (err) {
      setTestResult({
        ok: false,
        text: err instanceof Error ? err.message : '연결 테스트 중 오류가 발생했습니다.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload.email || !payload.host || (!isEditing && !payload.password)) {
      setTestResult({ ok: false, text: '필수 항목을 모두 입력해 주세요.' });
      return;
    }

    setSaving(true);
    try {
      await window.kkachi.saveAccount(payload);
      onSaved();
      onClose();
    } catch (err) {
      setTestResult({
        ok: false,
        text: err instanceof Error ? err.message : '저장에 실패했습니다.',
      });
    } finally {
      setSaving(false);
    }
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
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="modal-header">
          <h2>{isEditing ? '이메일 계정 편집' : '새 이메일 계정 추가'}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          {!isEditing && (
            <div className="field">
              <label>메일 서비스 프리셋</label>
              <select
                className="input-field"
                value={presetId}
                onChange={(e) => applyPreset(e.target.value)}
              >
                {MAIL_PROVIDER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activePreset?.note && <div className="helper-note">{activePreset.note}</div>}

          <div className="form-section">
            <div className="form-section-title">
              <MailIcon size={14} />
              기본 계정 정보
            </div>
            <div className="form-row-2">
              <div className="field">
                <label>계정 별칭</label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 업무 메일, 개인 Gmail"
                />
              </div>
              <div className="field">
                <label>이메일 주소 *</label>
                <input
                  type="email"
                  className="input-field"
                  value={email}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmail(v);
                    if (!isEditing && (!username || username === email)) {
                      setUsername(v);
                    }
                  }}
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="field">
                <label>로그인 아이디</label>
                <input
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="보통 이메일 주소와 동일"
                />
              </div>
              <div className="field">
                <label>
                  비밀번호 / 앱 비밀번호 {isEditing ? '(변경 시에만 입력)' : '*'}
                </label>
                <input
                  type="password"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEditing ? '••••••••' : '앱 비밀번호 입력'}
                  required={!isEditing}
                />
              </div>
            </div>

            <div className="checkbox-row" style={{ paddingTop: '2px' }}>
              <div className="color-swatches">
                {ACCOUNT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                    title="계정 색상 선택"
                  />
                ))}
              </div>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                순차 모니터링 활성화
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ServerIcon size={14} />
                수신 서버 설정
              </span>
              <div className="segmented">
                <button
                  type="button"
                  className={protocol === 'imap' ? 'active' : ''}
                  onClick={() => handleProtocolChange('imap')}
                >
                  IMAP
                </button>
                <button
                  type="button"
                  className={protocol === 'pop3' ? 'active' : ''}
                  onClick={() => handleProtocolChange('pop3')}
                >
                  POP3
                </button>
              </div>
            </div>

            <div className="form-row-3">
              <div className="field">
                <label>수신 서버 주소 *</label>
                <input
                  type="text"
                  className="input-field"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="imap.example.com"
                  required
                />
              </div>
              <div className="field">
                <label>포트</label>
                <input
                  type="number"
                  className="input-field"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  required
                />
              </div>
              <div className="field" style={{ justifyContent: 'flex-end', paddingBottom: '6px' }}>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={secure}
                    onChange={(e) => setSecure(e.target.checked)}
                  />
                  SSL/TLS
                </label>
              </div>
            </div>

            {protocol === 'pop3' && !secure && (
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={starttls}
                  onChange={(e) => setStarttls(e.target.checked)}
                />
                POP3 STARTTLS(STLS) 업그레이드 사용
              </label>
            )}
          </div>

          <div className="form-section">
            <div className="form-section-title">
              <SendIcon size={14} />
              발신(SMTP) 서버 설정 · 답장용
            </div>
            <div className="form-row-3">
              <div className="field">
                <label>SMTP 서버 주소</label>
                <input
                  type="text"
                  className="input-field"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="field">
                <label>포트</label>
                <input
                  type="number"
                  className="input-field"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ justifyContent: 'flex-end', paddingBottom: '6px' }}>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                  />
                  SSL (465)
                </label>
              </div>
            </div>
          </div>

          {testResult && (
            <div className={`feedback-msg ${testResult.ok ? 'ok' : 'err'}`}>
              {testResult.ok ? <CheckIcon size={15} /> : <AlertCircleIcon size={15} />}
              <span>{testResult.text}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={testing}
            onClick={() => void handleTest()}
          >
            {testing ? '연결 확인 중...' : '연결 테스트'}
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장 중...' : isEditing ? '변경사항 저장' : '계정 등록'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
