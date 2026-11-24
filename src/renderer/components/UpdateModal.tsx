import React, { useRef } from 'react';
import type { AppUpdateInfo } from '../../shared/types';
import { CloseIcon, GlobeIcon } from './Icons';

interface UpdateModalProps {
  info: AppUpdateInfo;
  onClose: () => void;
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*|(https?:\/\/[^\s<>()]+))/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }

    const full = match[0];
    const k = `${keyPrefix}-${tokenIdx++}`;

    if (full.startsWith('`') && full.endsWith('`')) {
      nodes.push(
        <code key={k} className="md-inline-code">
          {full.slice(1, -1)}
        </code>
      );
    } else if (match[2] && match[3]) {
      const label = match[2];
      const href = match[3];
      nodes.push(
        <a
          key={k}
          href={href}
          className="md-link"
          onClick={(e) => {
            e.preventDefault();
            void window.kkachi.openExternal(href);
          }}
        >
          {label}
        </a>
      );
    } else if (match[4]) {
      nodes.push(<strong key={k}>{renderInlineMarkdown(match[4], k)}</strong>);
    } else if (match[5]) {
      nodes.push(<del key={k}>{renderInlineMarkdown(match[5], k)}</del>);
    } else if (match[6]) {
      nodes.push(<em key={k}>{renderInlineMarkdown(match[6], k)}</em>);
    } else if (match[7]) {
      const href = match[7].replace(/[.,;:!?)]+$/, '');
      const trailing = match[7].slice(href.length);
      nodes.push(
        <a
          key={k}
          href={href}
          className="md-link"
          onClick={(e) => {
            e.preventDefault();
            void window.kkachi.openExternal(href);
          }}
        >
          {href}
        </a>
      );
      if (trailing) nodes.push(trailing);
    } else {
      nodes.push(full);
    }

    lastIdx = match.index + full.length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

function renderMarkdownBlocks(markdown: string): React.ReactNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <pre key={`code-${i}`} className="md-code-block">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} className="md-hr" />);
      i++;
      continue;
    }

    // Heading (# .. ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2], `h-${i}`);
      if (level === 1) {
        blocks.push(
          <h3 key={`h-${i}`} className="md-h1">
            {content}
          </h3>
        );
      } else if (level === 2) {
        blocks.push(
          <h4 key={`h-${i}`} className="md-h2">
            {content}
          </h4>
        );
      } else {
        blocks.push(
          <h5 key={`h-${i}`} className="md-h3">
            {content}
          </h5>
        );
      }
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={`bq-${i}`} className="md-blockquote">
          {quoteLines.map((ql, idx) => (
            <p key={idx}>{renderInlineMarkdown(ql, `bq-${i}-${idx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="md-list">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item, `ul-${i}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="md-list md-ordered">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item, `ol-${i}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph (join consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={`p-${i}`} className="md-p">
        {renderInlineMarkdown(paraLines.join(' '), `p-${i}`)}
      </p>
    );
  }

  return blocks;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ info, onClose }) => {
  const backdropMouseDownRef = useRef(false);

  const publishedDate = info.publishedAt
    ? new Date(info.publishedAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleOpenRelease = () => {
    void window.kkachi.openExternal(info.releaseUrl);
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
      <div
        className="modal-card update-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{info.hasUpdate ? '새 업데이트 안내' : '업데이트 정보'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="닫기">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="update-version-banner">
            <div className="update-version-row">
              <span className="update-version-badge current">v{info.currentVersion}</span>
              <span className="update-version-arrow">→</span>
              <span className="update-version-badge latest">v{info.latestVersion}</span>
              {publishedDate && <span className="update-published-date">{publishedDate}</span>}
            </div>
            {info.releaseName && (
              <div className="update-release-title">{info.releaseName}</div>
            )}
          </div>

          <div className="update-notes-label">업데이트 내역</div>
          <div className="update-notes-box">
            {info.releaseNotes ? (
              <div className="md-content">{renderMarkdownBlocks(info.releaseNotes)}</div>
            ) : (
              <p className="md-empty">등록된 업데이트 내역이 없습니다.</p>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleOpenRelease}
            style={{ fontSize: '12px' }}
          >
            <GlobeIcon size={14} />
            GitHub 릴리즈 보기
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              나중에
            </button>
            <button type="button" className="btn btn-primary" onClick={handleOpenRelease}>
              최신 릴리즈 다운로드
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
