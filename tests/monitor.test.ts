import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStore } from '../src/main/store';
import { MailMonitor } from '../src/main/mail/monitor';
import type { EmailMessage, NotificationPayload } from '../src/shared/types';

function createTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkachi-test-'));
  const filePath = path.join(dir, 'store.json');
  const store = new AppStore(filePath, {
    encrypt: (s) => `plain:${s}`,
    decrypt: (s) => (s.startsWith('plain:') ? s.slice(6) : s),
  });
  return {
    store,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

describe('MailMonitor sequential polling & alerts', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('checks enabled accounts strictly sequentially, suppresses initial sync alerts, and translates + alerts on new mail', async () => {
    const tmp = createTempStore();
    cleanup = tmp.cleanup;
    const { store } = tmp;

    const acc1 = store.saveAccount({
      name: 'Work IMAP',
      email: 'work@example.com',
      protocol: 'imap',
      host: 'imap.example.com',
      port: 993,
      secure: true,
      username: 'work@example.com',
      password: 'pw1',
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      enabled: true,
      color: '#2563EB',
    });

    const acc2 = store.saveAccount({
      name: 'Personal POP3',
      email: 'personal@example.com',
      protocol: 'pop3',
      host: 'pop.example.com',
      port: 995,
      secure: true,
      username: 'personal@example.com',
      password: 'pw2',
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      enabled: true,
      color: '#0D9488',
    });

    store.saveAccount({
      name: 'Disabled Account',
      email: 'off@example.com',
      protocol: 'imap',
      host: 'imap.example.com',
      port: 993,
      secure: true,
      username: 'off@example.com',
      password: 'pw3',
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      enabled: false,
      color: '#475569',
    });

    const timeline: string[] = [];
    const alerts: NotificationPayload[] = [];
    let cycle = 0;

    const monitor = new MailMonitor(
      store,
      {
        onNewEmail: (payload) => alerts.push(payload),
      },
      {
        fetcher: async (account) => {
          timeline.push(`start:${account.id}`);
          await new Promise((r) => setTimeout(r, 25));
          timeline.push(`end:${account.id}`);

          if (cycle === 1 && account.id === acc1.id) {
            const existing: EmailMessage = {
              id: `${acc1.id}:uid-1`,
              accountId: acc1.id,
              uid: 'uid-1',
              fromName: 'Initial Sender',
              fromAddress: 'init@example.com',
              to: ['work@example.com'],
              subject: '기존 메일입니다',
              date: new Date('2026-11-20T10:00:00Z').toISOString(),
              snippet: '기존 메일 내용',
              textBody: '기존 메일 내용',
              isKorean: true,
              isRead: false,
              attachments: [],
            };
            return { emails: [existing], allUids: ['uid-1'] };
          }

          if (cycle === 2 && account.id === acc2.id) {
            const freshEnglish: EmailMessage = {
              id: `${acc2.id}:uid-2`,
              accountId: acc2.id,
              uid: 'uid-2',
              fromName: 'Global Partner',
              fromAddress: 'partner@example.com',
              to: ['personal@example.com'],
              subject: 'Contract Signed',
              date: new Date().toISOString(),
              snippet: 'We signed the agreement.',
              textBody: 'We signed the agreement.',
              isKorean: false,
              isRead: false,
              attachments: [],
            };
            return { emails: [freshEnglish], allUids: ['uid-2'] };
          }

          return {
            emails: [],
            allUids:
              account.id === acc1.id
                ? ['uid-1']
                : cycle >= 2
                  ? ['uid-2']
                  : [],
          };
        },
        translator: async (text) => `[KO] ${text}`,
      }
    );

    // Cycle 1: Initial sync -> strictly sequential order, zero alerts
    cycle = 1;
    await monitor.checkAllSequential();
    expect(timeline).toEqual([
      `start:${acc1.id}`,
      `end:${acc1.id}`,
      `start:${acc2.id}`,
      `end:${acc2.id}`,
    ]);
    expect(alerts).toHaveLength(0);
    expect(store.getEmails()).toHaveLength(1);

    // Cycle 2: New foreign email on account 2 -> translates subject & triggers alert once
    cycle = 2;
    await monitor.checkAllSequential();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].accountName).toBe('Personal POP3');
    expect(alerts[0].email.translatedSubject).toBe('[KO] Contract Signed');
    expect(alerts[0].email.translatedText).toBeUndefined();

    // Cycle 3: No new UIDs -> zero additional alerts
    cycle = 3;
    await monitor.checkAllSequential();
    expect(alerts).toHaveLength(1);
    expect(store.getEmails()).toHaveLength(2);
  });

  it('suppresses alerts for historical backlog emails and caps burst alerts per cycle', async () => {
    const tmp = createTempStore();
    cleanup = tmp.cleanup;
    const { store } = tmp;

    const acc = store.saveAccount({
      name: 'Gmail POP3',
      email: 'me@gmail.com',
      protocol: 'pop3',
      host: 'pop.gmail.com',
      port: 995,
      secure: true,
      username: 'me@gmail.com',
      password: 'app-password',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      enabled: true,
      color: '#EA580C',
    });

    const alerts: NotificationPayload[] = [];
    let cycle = 0;

    const makeMail = (idx: number, dateIso: string): EmailMessage => ({
      id: `${acc.id}:uid-${idx}`,
      accountId: acc.id,
      uid: `uid-${idx}`,
      fromName: `Sender ${idx}`,
      fromAddress: `sender${idx}@example.com`,
      to: ['me@gmail.com'],
      subject: `메일 제목 ${idx}`,
      date: dateIso,
      snippet: `본문 ${idx}`,
      textBody: `본문 ${idx}`,
      isKorean: true,
      isRead: false,
      attachments: [],
    });

    const monitor = new MailMonitor(
      store,
      {
        onNewEmail: (payload) => alerts.push(payload),
      },
      {
        fetcher: async () => {
          if (cycle === 1) {
            return {
              emails: [makeMail(1, new Date().toISOString())],
              allUids: ['uid-1'],
            };
          }
          if (cycle === 2) {
            // Historical mail older than 24h before lastCheckedAt (e.g. Gmail POP3 old batch)
            const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            return {
              emails: [makeMail(2, twoDaysAgo), makeMail(3, twoDaysAgo)],
              allUids: ['uid-1', 'uid-2', 'uid-3'],
            };
          }
          if (cycle === 3) {
            // Burst of 7 genuinely recent unread emails -> capped at 5 most recent alerts
            const now = Date.now();
            const burst = Array.from({ length: 7 }, (_, i) =>
              makeMail(10 + i, new Date(now + i * 1000).toISOString())
            );
            return {
              emails: burst,
              allUids: burst.map((e) => e.uid),
            };
          }
          return { emails: [], allUids: [] };
        },
        translator: async (text) => text,
      }
    );

    cycle = 1;
    await monitor.checkAllSequential();
    expect(alerts).toHaveLength(0);

    cycle = 2;
    await monitor.checkAllSequential();
    expect(store.getEmails()).toHaveLength(3);
    expect(alerts).toHaveLength(0);

    cycle = 3;
    await monitor.checkAllSequential();
    expect(store.getEmails()).toHaveLength(10);
    expect(alerts).toHaveLength(5);
    expect(alerts.map((a) => a.email.uid)).toEqual([
      'uid-12',
      'uid-13',
      'uid-14',
      'uid-15',
      'uid-16',
    ]);
  });
});
