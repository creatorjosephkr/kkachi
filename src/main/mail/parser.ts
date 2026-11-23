import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import type { EmailAttachment, EmailMessage } from '../../shared/types';
import { isKoreanText } from '../translator';

function extractAddresses(addrObj?: AddressObject | AddressObject[]): string[] {
  if (!addrObj) return [];
  const list = Array.isArray(addrObj) ? addrObj : [addrObj];
  const results: string[] = [];
  for (const item of list) {
    for (const entry of item.value ?? []) {
      if (entry.address) {
        results.push(entry.name ? `${entry.name} <${entry.address}>` : entry.address);
      }
    }
  }
  return results;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function buildSnippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 140) return clean;
  return `${clean.slice(0, 140)}...`;
}

export async function parseRawEmail(
  rawSource: Buffer | string,
  accountId: string,
  uid: string
): Promise<EmailMessage> {
  const parsed: ParsedMail = await simpleParser(rawSource);

  const fromEntry = parsed.from?.value?.[0];
  const fromAddress = fromEntry?.address || 'unknown@unknown';
  const fromName = fromEntry?.name?.trim() || fromAddress;
  const subject = parsed.subject?.trim() || '(제목 없음)';

  const htmlBody = typeof parsed.html === 'string' ? parsed.html : undefined;
  const rawText = parsed.text?.trim() || (htmlBody ? stripHtmlToText(htmlBody) : '');
  const textBody = rawText || '(본문 없음)';

  const attachments: EmailAttachment[] = (parsed.attachments ?? []).map((att) => ({
    filename: att.filename || 'attachment',
    contentType: att.contentType || 'application/octet-stream',
    size: att.size || 0,
  }));

  const combinedSample = `${subject}\n${textBody.slice(0, 1000)}`;
  const isKorean = isKoreanText(combinedSample);

  return {
    id: `${accountId}:${uid}`,
    accountId,
    uid,
    messageId: parsed.messageId || undefined,
    fromName,
    fromAddress,
    to: extractAddresses(parsed.to),
    subject,
    date: (parsed.date ?? new Date()).toISOString(),
    snippet: buildSnippet(textBody),
    textBody,
    htmlBody,
    isKorean,
    isRead: false,
    attachments,
  };
}
