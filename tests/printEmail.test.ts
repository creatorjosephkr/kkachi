import { describe, expect, it } from 'vitest';
import {
  buildEmailPrintHtml,
  sanitizeHtmlForPrint,
  sanitizePrintFilename,
} from '../src/main/mail/printEmail';
import type { EmailMessage } from '../src/shared/types';

function makeEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'acc-1:uid-10',
    accountId: 'acc-1',
    uid: 'uid-10',
    fromName: 'Alice <Team>',
    fromAddress: 'alice@example.com',
    to: ['me@example.com'],
    subject: 'Q4 Launch Report',
    translatedSubject: '4분기 출시 보고서',
    date: '2026-11-23T10:00:00.000Z',
    snippet: 'Hello team',
    textBody: 'Hello team\n<script>alert(1)</script>',
    htmlBody:
      '<div><p onclick="alert(1)">Original <strong>HTML</strong></p><img src="https://example.com/pic.png" onerror="evil()" /><script>bad()</script><a href="javascript:evil()">bad link</a></div>',
    translatedText: '안녕하세요 팀\n보고서 공유드립니다.',
    translatedHtml:
      '<div><p>번역된 <strong>HTML</strong> 본문</p><iframe src="https://evil.test"></iframe></div>',
    isKorean: false,
    isRead: true,
    attachments: [{ filename: 'report.pdf', contentType: 'application/pdf', size: 2048 }],
    ...overrides,
  };
}

describe('sanitizePrintFilename', () => {
  it('strips invalid filesystem characters, collapses whitespace, and caps length', () => {
    expect(sanitizePrintFilename('Re: [공지] <월간/보고서>? *최종*')).toBe('Re [공지] 월간 보고서 최종');
    expect(sanitizePrintFilename('   <>:"/\\|?*   ')).toBe('email');
    expect(sanitizePrintFilename('A'.repeat(120))).toHaveLength(80);
  });
});

describe('sanitizeHtmlForPrint', () => {
  it('removes forbidden tags, inline event handlers, and javascript URLs while keeping safe HTML', () => {
    const dirty =
      '<div><p onclick="steal()">Safe <b>Text</b></p><script>alert(1)</script><iframe src="x"></iframe><a href="javascript:alert(2)">x</a><a href="https://example.com">ok</a><img src="https://example.com/a.png" onerror="xss()"></div>';
    const clean = sanitizeHtmlForPrint(dirty);

    expect(clean).toContain('<b>Text</b>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('src="https://example.com/a.png"');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
  });
});

describe('buildEmailPrintHtml', () => {
  it('renders original HTML view safely with metadata and attachments', () => {
    const html = buildEmailPrintHtml(makeEmail(), {
      mode: 'original',
      accountName: '업무 메일',
    });

    expect(html).toContain('원문');
    expect(html).toContain('업무 메일');
    expect(html).toContain('Q4 Launch Report');
    expect(html).toContain('4분기 출시 보고서');
    expect(html).toContain('Alice &lt;Team&gt; &lt;alice@example.com&gt;');
    expect(html).toContain('report.pdf');
    expect(html).toContain('Original <strong>HTML</strong>');
    expect(html).not.toContain('번역된 <strong>HTML</strong> 본문');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
  });

  it('renders translated HTML view when mode is translated and translation exists', () => {
    const html = buildEmailPrintHtml(makeEmail(), {
      mode: 'translated',
      accountName: '업무 메일',
    });

    expect(html).toContain('한국어 번역');
    expect(html).toContain('번역된 <strong>HTML</strong> 본문');
    expect(html).not.toContain('Original <strong>HTML</strong>');
    expect(html).not.toContain('<iframe');
  });

  it('escapes plain text emails and falls back to original if translation is missing', () => {
    const plainEmail = makeEmail({
      htmlBody: undefined,
      translatedHtml: undefined,
      translatedText: undefined,
    });

    const html = buildEmailPrintHtml(plainEmail, { mode: 'translated' });
    expect(html).toContain('원문');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<pre class="plain-body">');
  });
});
