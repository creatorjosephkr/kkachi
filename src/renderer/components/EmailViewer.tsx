import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type {
  AccountPublic,
  EmailMessage,
} from '../../shared/types';
import {
  AlertCircleIcon,
  CheckIcon,
  FilePdfIcon,
  GlobeIcon,
  KkachiLogoIcon,
  MailIcon,
  MailOpenIcon,
  PanelRightCloseIcon,
  PaperclipIcon,
  PrinterIcon,
  RefreshIcon,
  ReplyIcon,
  SendIcon,
  TranslateIcon,
  TrashIcon,
} from './Icons';

interface EmailViewerProps {
  email: EmailMessage | null;
  account?: AccountPublic;
  onToggleRead: (emailId: string, isRead: boolean) => void;
  onDelete: (emailId: string) => void;
  onTranslate: (emailId: string, force?: boolean) => Promise<void>;
  onCloseViewer: () => void;
}

interface ShadowHtmlViewProps {
  html: string;
}

const ShadowHtmlView: React.FC<ShadowHtmlViewProps> = ({ html }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!shadowRef.current) {
      shadowRef.current = host.attachShadow({ mode: 'open' });
    }
    const shadow = shadowRef.current;

    const clean = DOMPurify.sanitize(html, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'meta', 'link', 'base'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });

    shadow.innerHTML = `<style>
      :host {
        display: block;
        width: 100%;
        background: #ffffff;
        color: #0f172a;
      }
      .kkachi-email-body {
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif;
        font-size: 13.5px;
        line-height: 1.6;
        color: #0f172a;
        word-break: break-word;
        overflow-x: auto;
      }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; }
      a { color: #2563eb; }
      pre, code { white-space: pre-wrap; }
    </style><div class="kkachi-email-body">${clean}</div>`;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href && (href.startsWith('https://') || href.startsWith('http://'))) {
        e.preventDefault();
        void window.kkachi.openExternal(href);
      }
    };

    shadow.addEventListener('click', handleClick);
    return () => {
      shadow.removeEventListener('click', handleClick);
    };
  }, [html]);

  return <div ref={hostRef} className="shadow-html-host" />;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatIpcError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  return err.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim() || fallback;
}

export const EmailViewer: React.FC<EmailViewerProps> = ({
  email,
  account,
  onToggleRead,
  onDelete,
  onTranslate,
  onCloseViewer,
}) => {
  const [activeTab, setActiveTab] = useState<'original' | 'translated'>('original');
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [exporting, setExporting] = useState<'print' | 'pdf' | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const exportTimerRef = useRef<number | null>(null);

  const scheduleFeedbackClear = () => {
    if (exportTimerRef.current !== null) {
      window.clearTimeout(exportTimerRef.current);
    }
    exportTimerRef.current = window.setTimeout(() => {
      setExportFeedback(null);
      exportTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (exportTimerRef.current !== null) {
        window.clearTimeout(exportTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setReplyOpen(false);
    setReplyFeedback(null);
    setTranslateError(null);
    setTranslating(false);
    setExporting(null);
    setExportFeedback(null);
    if (exportTimerRef.current !== null) {
      window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = null;
    }
    setActiveTab('original');
    if (email) {
      setReplyTo(email.fromAddress);
      setReplySubject(
        email.subject.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`
      );
      setReplyBody('');
    }
  }, [email?.id]);

  if (!email) {
    return (
      <main className="viewer-pane">
        <div className="viewer-empty-top-bar">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '5px 9px' }}
            onClick={onCloseViewer}
          >
            <PanelRightCloseIcon size={15} />
            닫기
          </button>
        </div>
        <div className="empty-state">
          <KkachiLogoIcon size={54} />
          <h3>까치 (Kkachi) 이메일 모니터</h3>
          <p>
            왼쪽 목록에서 확인할 이메일을 선택하세요. 한국어가 아닌 메일은 원문과 한국어 번역본을 함께 보여줍니다.
          </p>
        </div>
      </main>
    );
  }

  const showTranslationControls = !email.isKorean;
  const hasTranslatedBody = email.htmlBody
    ? Boolean(email.translatedHtml)
    : Boolean(email.translatedText);

  const handleManualTranslate = async (force = false) => {
    setTranslating(true);
    setTranslateError(null);
    try {
      await onTranslate(email.id, force);
    } catch (err) {
      setTranslateError(formatIpcError(err, '번역 중 오류가 발생했습니다.'));
    } finally {
      setTranslating(false);
    }
  };

  const handleSelectTranslatedTab = () => {
    setActiveTab('translated');
    if (!hasTranslatedBody && !translating) {
      void handleManualTranslate(false);
    }
  };

  const getExportMode = () =>
    activeTab === 'translated' && hasTranslatedBody ? 'translated' : 'original';

  const handlePrint = async () => {
    setExporting('print');
    setExportFeedback(null);
    try {
      const res = await window.kkachi.printEmail(email.id, getExportMode());
      if (res.ok) {
        setExportFeedback({ ok: true, text: '인쇄 대화상자를 완료했습니다.' });
        scheduleFeedbackClear();
      } else if (!res.canceled) {
        setExportFeedback({ ok: false, text: res.error || '인쇄를 완료하지 못했습니다.' });
      }
    } catch (err) {
      setExportFeedback({
        ok: false,
        text: formatIpcError(err, '인쇄 중 오류가 발생했습니다.'),
      });
    } finally {
      setExporting(null);
    }
  };

  const handleSavePdf = async () => {
    setExporting('pdf');
    setExportFeedback(null);
    try {
      const res = await window.kkachi.saveEmailPdf(email.id, getExportMode());
      if (res.ok) {
        const fileName = res.filePath ? res.filePath.split(/[\\/]/).pop() || res.filePath : 'PDF';
        setExportFeedback({ ok: true, text: `PDF 저장 완료: ${fileName}` });
        scheduleFeedbackClear();
      } else if (!res.canceled) {
        setExportFeedback({ ok: false, text: res.error || 'PDF 저장에 실패했습니다.' });
      }
    } catch (err) {
      setExportFeedback({
        ok: false,
        text: formatIpcError(err, 'PDF 저장 중 오류가 발생했습니다.'),
      });
    } finally {
      setExporting(null);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTo.trim() || !replyBody.trim()) return;

    setSendingReply(true);
    setReplyFeedback(null);
    try {
      const res = await window.kkachi.sendReply({
        accountId: email.accountId,
        originalEmailId: email.id,
        to: replyTo.trim(),
        subject: replySubject.trim(),
        body: replyBody,
      });
      if (res.ok) {
        setReplyFeedback({ ok: true, text: '답장을 성공적으로 보냈습니다.' });
        setReplyBody('');
      } else {
        setReplyFeedback({
          ok: false,
          text: res.error || '답장을 보내지 못했습니다.',
        });
      }
    } catch (err) {
      setReplyFeedback({
        ok: false,
        text: err instanceof Error ? err.message : '답장 전송 중 오류가 발생했습니다.',
      });
    } finally {
      setSendingReply(false);
    }
  };

  const renderOriginalCard = () => (
    <div className="content-card">
      {email.htmlBody ? (
        <ShadowHtmlView html={email.htmlBody} />
      ) : (
        <div className="content-card-body">{email.textBody}</div>
      )}
    </div>
  );

  const renderTranslatedCard = () => {
    if (translating) {
      return (
        <div className="content-card">
          <div className="content-card-body">
            <span style={{ color: 'var(--text-muted)' }}>
              원문 형식을 유지하며 한국어로 번역하고 있습니다...
            </span>
          </div>
        </div>
      );
    }

    if (translateError) {
      return (
        <div className="content-card">
          <div className="content-card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ color: 'var(--danger)' }}>{translateError}</div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleManualTranslate(true)}
              >
                <RefreshIcon size={14} />
                다시 시도
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (email.htmlBody && email.translatedHtml) {
      return (
        <div className="content-card">
          <ShadowHtmlView html={email.translatedHtml} />
        </div>
      );
    }

    if (!email.htmlBody && email.translatedText) {
      return (
        <div className="content-card">
          <div className="content-card-body">{email.translatedText}</div>
        </div>
      );
    }

    return (
      <div className="content-card">
        <div className="content-card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--text-muted)' }}>아직 번역되지 않은 메일입니다.</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleManualTranslate(true)}
            >
              <TranslateIcon size={14} />
              한국어로 번역하기
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="viewer-pane">
      <header className="viewer-header">
        <div className="viewer-top-bar">
          <div className="account-chip">
            <span
              className="account-dot"
              style={{ backgroundColor: account?.color || '#64748b' }}
            />
            <span>{account?.name || account?.email || '알 수 없는 계정'}</span>
            {account && <span className="proto-tag">{account.protocol}</span>}
          </div>

          <div className="viewer-actions">
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '5px 9px', fontSize: '12px' }}
              disabled={exporting !== null}
              title="이메일 내용 인쇄"
              onClick={() => void handlePrint()}
            >
              <PrinterIcon size={14} />
              {exporting === 'print' ? '준비 중...' : '인쇄'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '5px 9px', fontSize: '12px' }}
              disabled={exporting !== null}
              title="PDF 파일로 저장"
              onClick={() => void handleSavePdf()}
            >
              <FilePdfIcon size={14} />
              {exporting === 'pdf' ? '저장 중...' : 'PDF'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '5px 9px', fontSize: '12px' }}
              onClick={() => setReplyOpen((prev) => !prev)}
            >
              <ReplyIcon size={14} />
              답장
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '5px 9px', fontSize: '12px' }}
              title={email.isRead ? '안 읽음으로 표시' : '읽음으로 표시'}
              onClick={() => onToggleRead(email.id, !email.isRead)}
            >
              {email.isRead ? <MailIcon size={14} /> : <MailOpenIcon size={14} />}
              {email.isRead ? '안 읽음 표시' : '읽음 처리'}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="이 목록에서 삭제"
              onClick={() => onDelete(email.id)}
            >
              <TrashIcon size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="이메일 내용 영역 닫기"
              onClick={onCloseViewer}
            >
              <PanelRightCloseIcon size={16} />
            </button>
          </div>
        </div>

        <h1 className="viewer-subject">{email.subject}</h1>

        {showTranslationControls && email.translatedSubject && (
          <div className="viewer-translated-subject">
            <TranslateIcon size={15} />
            <span>{email.translatedSubject}</span>
          </div>
        )}

        <div className="viewer-meta">
          <div>
            <strong>{email.fromName}</strong> &lt;{email.fromAddress}&gt;
            {email.to.length > 0 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                → {email.to.join(', ')}
              </span>
            )}
          </div>
          <div>
            {new Date(email.date).toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>

        {email.attachments.length > 0 && (
          <div className="viewer-attachments">
            {email.attachments.map((att, idx) => (
              <span key={`${att.filename}-${idx}`} className="attachment-chip">
                <PaperclipIcon size={12} />
                {att.filename} ({formatBytes(att.size)})
              </span>
            ))}
          </div>
        )}
      </header>

      {exportFeedback && (
        <div style={{ padding: '8px 24px 0' }}>
          <span className={`feedback-msg ${exportFeedback.ok ? 'ok' : 'err'}`}>
            {exportFeedback.ok ? <CheckIcon size={14} /> : <AlertCircleIcon size={14} />}
            {exportFeedback.text}
          </span>
        </div>
      )}

      {showTranslationControls && (
        <div className="translation-bar">
          <div className="viewer-tabs" role="tablist" aria-label="이메일 보기 전환">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'original'}
              className={`viewer-tab ${activeTab === 'original' ? 'active' : ''}`}
              onClick={() => setActiveTab('original')}
            >
              <GlobeIcon size={14} />
              <span>원문</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'translated'}
              className={`viewer-tab ${activeTab === 'translated' ? 'active' : ''}`}
              onClick={handleSelectTranslatedTab}
            >
              <TranslateIcon size={14} />
              <span>한국어 번역</span>
            </button>
          </div>

          {activeTab === 'translated' && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              disabled={translating}
              onClick={() => void handleManualTranslate(true)}
            >
              <RefreshIcon size={13} />
              {translating ? '번역 중...' : '다시 번역'}
            </button>
          )}
        </div>
      )}

      <div className="viewer-body">
        {showTranslationControls && activeTab === 'translated'
          ? renderTranslatedCard()
          : renderOriginalCard()}
      </div>

      {replyOpen && (
        <form className="reply-box" onSubmit={(e) => void handleSendReply(e)}>
          <div className="reply-grid">
            <input
              type="text"
              className="input-field"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="받는 사람 이메일"
              required
            />
            <input
              type="text"
              className="input-field"
              value={replySubject}
              onChange={(e) => setReplySubject(e.target.value)}
              placeholder="제목"
              required
            />
          </div>

          <textarea
            className="reply-textarea"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="간단한 답장을 입력하세요..."
            required
          />

          <div className="reply-footer">
            <div>
              {replyFeedback && (
                <span className={`feedback-msg ${replyFeedback.ok ? 'ok' : 'err'}`}>
                  {replyFeedback.ok ? (
                    <CheckIcon size={14} />
                  ) : (
                    <AlertCircleIcon size={14} />
                  )}
                  {replyFeedback.text}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReplyOpen(false)}
              >
                취소
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={sendingReply || !replyBody.trim()}
              >
                <SendIcon size={14} />
                {sendingReply ? '보내는 중...' : '답장 보내기'}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
};
