import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { parseDocument } from 'htmlparser2';
import { isTag, type ChildNode } from 'domhandler';
import render from 'dom-serializer';
import type { EmailExportMode, EmailExportResult, EmailMessage } from '../../shared/types';

const FORBIDDEN_PRINT_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'meta',
  'base',
]);

export function sanitizePrintFilename(subject: string): string {
  const cleaned = (subject || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || 'email';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeNodes(nodes: ChildNode[]): ChildNode[] {
  const kept: ChildNode[] = [];
  for (const node of nodes) {
    if (isTag(node)) {
      const tag = node.name.toLowerCase();
      if (FORBIDDEN_PRINT_TAGS.has(tag)) {
        continue;
      }
      if (node.attribs) {
        for (const attr of Object.keys(node.attribs)) {
          const lowerAttr = attr.toLowerCase();
          if (lowerAttr.startsWith('on')) {
            delete node.attribs[attr];
            continue;
          }
          if (
            (lowerAttr === 'href' ||
              lowerAttr === 'src' ||
              lowerAttr === 'action' ||
              lowerAttr === 'formaction') &&
            /^\s*(javascript|vbscript):/i.test(node.attribs[attr] ?? '')
          ) {
            delete node.attribs[attr];
          }
        }
      }
      node.children = sanitizeNodes(node.children);
    }
    kept.push(node);
  }
  return kept;
}

export function sanitizeHtmlForPrint(html: string): string {
  const doc = parseDocument(html || '');
  doc.children = sanitizeNodes(doc.children);
  return render(doc, { encodeEntities: 'utf8' });
}

function formatPrintDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildEmailPrintHtml(
  email: EmailMessage,
  options: { mode: EmailExportMode; accountName?: string }
): string {
  const hasTranslatedBody = email.htmlBody
    ? Boolean(email.translatedHtml)
    : Boolean(email.translatedText);
  const useTranslated = options.mode === 'translated' && hasTranslatedBody;
  const viewLabel = useTranslated ? '한국어 번역' : '원문';

  const senderText = email.fromName
    ? `${email.fromName} <${email.fromAddress}>`
    : email.fromAddress;

  let renderedBody: string;
  if (useTranslated && email.htmlBody && email.translatedHtml) {
    renderedBody = `<div class="html-body">${sanitizeHtmlForPrint(email.translatedHtml)}</div>`;
  } else if (email.htmlBody) {
    renderedBody = `<div class="html-body">${sanitizeHtmlForPrint(email.htmlBody)}</div>`;
  } else {
    const plain =
      useTranslated && email.translatedText ? email.translatedText : email.textBody;
    renderedBody = `<pre class="plain-body">${escapeHtml(plain || '')}</pre>`;
  }

  const attachmentsHtml =
    email.attachments.length > 0
      ? `<div class="meta-row"><span class="meta-label">첨부파일</span><span>${escapeHtml(
          email.attachments.map((a) => a.filename).join(', ')
        )}</span></div>`
      : '';

  const translatedSubjectHtml =
    email.translatedSubject && !email.isKorean
      ? `<div class="translated-subject">번역 제목: ${escapeHtml(email.translatedSubject)}</div>`
      : '';

  const accountBadgeHtml = options.accountName
    ? `<span class="badge">${escapeHtml(options.accountName)}</span>`
    : '';

  const recipientsHtml =
    email.to.length > 0
      ? `<div class="meta-row"><span class="meta-label">받는 사람</span><span>${escapeHtml(
          email.to.join(', ')
        )}</span></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(email.subject || '이메일')}</title>
<style>
  @page {
    size: A4;
    margin: 14mm;
  }
  * {
    box-sizing: border-box;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif;
    font-size: 13px;
    line-height: 1.6;
  }
  .print-container {
    width: 100%;
    padding: 8px 4px;
  }
  .email-header {
    padding-bottom: 14px;
    margin-bottom: 18px;
    border-bottom: 1.5px solid #e2e8f0;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #334155;
    font-size: 11px;
    font-weight: 600;
  }
  .subject {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.35;
    color: #0f172a;
    word-break: break-word;
  }
  .translated-subject {
    margin-bottom: 10px;
    font-size: 13.5px;
    font-weight: 600;
    color: #2563eb;
    word-break: break-word;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    font-size: 12px;
    color: #334155;
  }
  .meta-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .meta-label {
    flex-shrink: 0;
    width: 62px;
    color: #64748b;
    font-weight: 600;
  }
  .html-body {
    width: 100%;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .html-body img {
    max-width: 100%;
    height: auto;
  }
  .html-body table {
    max-width: 100%;
  }
  .html-body pre, .html-body code {
    white-space: pre-wrap;
  }
  .plain-body {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.65;
    color: #0f172a;
  }
</style>
</head>
<body>
  <article class="print-container">
    <header class="email-header">
      <div class="badges">
        ${accountBadgeHtml}
        <span class="badge">${escapeHtml(viewLabel)}</span>
      </div>
      <h1 class="subject">${escapeHtml(email.subject || '(제목 없음)')}</h1>
      ${translatedSubjectHtml}
      <div class="meta">
        <div class="meta-row"><span class="meta-label">보낸 사람</span><span>${escapeHtml(senderText)}</span></div>
        ${recipientsHtml}
        <div class="meta-row"><span class="meta-label">날짜</span><span>${escapeHtml(formatPrintDate(email.date))}</span></div>
        ${attachmentsHtml}
      </div>
    </header>
    <section class="email-content">
      ${renderedBody}
    </section>
  </article>
</body>
</html>`;
}

async function runWithPrintWindow<T>(
  html: string,
  action: (win: BrowserWindow) => Promise<T>
): Promise<T> {
  // Dynamically require electron so pure Node unit tests can import helpers cleanly
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BrowserWindow } = require('electron') as typeof import('electron');
  const tmpPath = path.join(
    os.tmpdir(),
    `kkachi-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
  );
  fs.writeFileSync(tmpPath, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1100,
    backgroundColor: '#ffffff',
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('인쇄 문서 준비 시간이 초과되었습니다.'));
      }, 15000);

      win.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });
      win.webContents.once('did-fail-load', (_event, _code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`인쇄 문서를 불러오지 못했습니다: ${desc}`));
      });

      void win.loadFile(tmpPath);
    });

    await new Promise((r) => setTimeout(r, 150));
    return await action(win);
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore temp cleanup errors
    }
  }
}

export async function printEmailDocument(
  email: EmailMessage,
  options: { mode: EmailExportMode; accountName?: string }
): Promise<EmailExportResult> {
  const html = buildEmailPrintHtml(email, options);
  return runWithPrintWindow(
    html,
    (win) =>
      new Promise<EmailExportResult>((resolve) => {
        win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
          if (success) {
            resolve({ ok: true });
            return;
          }
          if (/cancel/i.test(failureReason || '')) {
            resolve({ ok: false, canceled: true });
            return;
          }
          resolve({
            ok: false,
            error: failureReason
              ? `인쇄 실패: ${failureReason}`
              : '인쇄를 완료하지 못했습니다.',
          });
        });
      })
  );
}

export async function saveEmailAsPdf(
  email: EmailMessage,
  options: {
    mode: EmailExportMode;
    accountName?: string;
    parentWindow?: BrowserWindow | null;
  }
): Promise<EmailExportResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dialog } = require('electron') as typeof import('electron');
  const titleForFile =
    options.mode === 'translated' && email.translatedSubject
      ? email.translatedSubject
      : email.subject;
  const defaultPath = `${sanitizePrintFilename(titleForFile)}.pdf`;
  const dialogOptions = {
    title: 'PDF로 저장',
    defaultPath,
    filters: [{ name: 'PDF 문서', extensions: ['pdf'] }],
  };

  const parent =
    options.parentWindow && !options.parentWindow.isDestroyed() ? options.parentWindow : null;
  const saveResult = parent
    ? await dialog.showSaveDialog(parent, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }

  const html = buildEmailPrintHtml(email, options);
  const pdfBuffer = await runWithPrintWindow(html, (win) =>
    win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
  );

  fs.writeFileSync(saveResult.filePath, pdfBuffer);
  return { ok: true, filePath: saveResult.filePath };
}
