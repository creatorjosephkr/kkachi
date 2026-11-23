import nodemailer from 'nodemailer';
import type {
  AccountConfig,
  EmailMessage,
  ReplyPayload,
  SendReplyResult,
} from '../../shared/types';

export async function sendReplyEmail(
  account: AccountConfig,
  originalEmail: EmailMessage | undefined,
  payload: ReplyPayload
): Promise<SendReplyResult> {
  if (!account.smtpHost) {
    return {
      ok: false,
      error: '발신(SMTP) 서버가 설정되지 않았습니다. 계정 설정에서 SMTP 정보를 입력해 주세요.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: {
        user: account.username,
        pass: account.password,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    const subject = payload.subject.trim()
      || (originalEmail
        ? originalEmail.subject.startsWith('Re:')
          ? originalEmail.subject
          : `Re: ${originalEmail.subject}`
        : 'Re:');

    const headers: Record<string, string> = {};
    if (originalEmail?.messageId) {
      headers['In-Reply-To'] = originalEmail.messageId;
      headers['References'] = originalEmail.messageId;
    }

    const fromHeader = account.name
      ? `"${account.name.replace(/"/g, '\\"')}" <${account.email}>`
      : account.email;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: payload.to,
      subject,
      text: payload.body,
      headers,
    });

    return {
      ok: true,
      messageId: info.messageId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '답장 전송에 실패했습니다.',
    };
  }
}
