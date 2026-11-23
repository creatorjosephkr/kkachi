import { describe, expect, it, vi } from 'vitest';
import type { FetchMessageObject, MailboxObject } from 'imapflow';
import {
  createImapClient,
  deriveHighWaterMark,
  fetchFromConnectedImapClient,
  type ImapClientSession,
} from '../src/main/mail/imapClient';
import type { AccountConfig } from '../src/shared/types';

const TEST_ACCOUNT: AccountConfig = {
  id: 'imap-test',
  name: 'Test IMAP',
  email: 'me@example.com',
  protocol: 'imap',
  host: 'imap.example.com',
  port: 993,
  secure: true,
  username: 'me@example.com',
  password: 'secret',
  smtpHost: 'smtp.example.com',
  smtpPort: 465,
  smtpSecure: true,
  enabled: true,
  color: '#2563EB',
};

function makeRawEmail(subject: string, idNum: number): Buffer {
  return Buffer.from(
    [
      `From: Sender ${idNum} <sender${idNum}@example.com>`,
      'To: me@example.com',
      `Subject: ${subject}`,
      `Message-ID: <msg-${idNum}@example.com>`,
      'Date: Mon, 23 Nov 2026 10:00:00 +0900',
      'Content-Type: text/plain; charset=utf-8',
      '',
      `Body of message ${idNum}.`,
    ].join('\r\n'),
    'utf8'
  );
}

function makeMailbox(overrides: Partial<MailboxObject> = {}): MailboxObject {
  return {
    path: 'INBOX',
    delimiter: '/',
    flags: new Set(),
    uidValidity: 100n,
    uidNext: 1,
    exists: 0,
    ...overrides,
  };
}

describe('imapClient error handling', () => {
  it('captures emitted Socket timeout error without throwing an uncaught exception', () => {
    const managed = createImapClient(TEST_ACCOUNT);
    const timeoutErr = Object.assign(new Error('Socket timeout'), { code: 'ETIMEOUT' });

    expect(() => {
      managed.client.emit('error', timeoutErr);
    }).not.toThrow();

    expect(managed.getLastError()).toBe(timeoutErr);
    managed.client.close();
  });
});

describe('deriveHighWaterMark', () => {
  it('uses savedLastUid when uidValidity matches', () => {
    const seen = new Set(['100:5', '100:25']);
    expect(deriveHighWaterMark(seen, '100', '100', 42)).toBe(42);
  });

  it('ignores savedLastUid when uidValidity mismatches and falls back to seenUids', () => {
    const seen = new Set(['100:500', '200:12', '200:invalid', '200:8']);
    expect(deriveHighWaterMark(seen, '200', '100', 999)).toBe(12);
    expect(deriveHighWaterMark(seen, '300', '100', 999)).toBe(0);
  });

  it('migrates cleanly from existing seenUids when no saved high-water mark exists', () => {
    const seen = new Set(['555:10', '555:1500', '555:32', '999:99999']);
    expect(deriveHighWaterMark(seen, '555')).toBe(1500);
  });
});

describe('fetchFromConnectedImapClient', () => {
  it('short-circuits with zero SEARCH/FETCH when uidNext <= lastUid + 1', async () => {
    const release = vi.fn();
    const search = vi.fn();
    const fetch = vi.fn();

    const session: ImapClientSession = {
      mailbox: makeMailbox({ uidValidity: 100n, exists: 2000, uidNext: 2001 }),
      getMailboxLock: vi.fn(async () => ({ path: 'INBOX', release })),
      search,
      fetch,
    };

    const result = await fetchFromConnectedImapClient(session, TEST_ACCOUNT, {
      seenUids: new Set(['100:2000']),
      initialFetchCount: 15,
      initialSyncDone: true,
      imapUidValidity: '100',
      imapLastUid: 2000,
    });

    expect(result.emails).toEqual([]);
    expect(result.allUids).toEqual([]);
    expect(result.imapState).toEqual({ uidValidity: '100', lastUid: 2000 });
    expect(search).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it('uses sequence-range fetch without SEARCH ALL during initial sync', async () => {
    const release = vi.fn();
    const search = vi.fn();
    const fetchRanges: unknown[] = [];

    const fetchedMessages: FetchMessageObject[] = [
      { seq: 99, uid: 249, source: makeRawEmail('Already read', 249), flags: new Set(['\\Seen']) },
      { seq: 100, uid: 250, source: makeRawEmail('Unread recent', 250), flags: new Set() },
    ];

    const session: ImapClientSession = {
      mailbox: makeMailbox({ uidValidity: 100n, exists: 100, uidNext: 251 }),
      getMailboxLock: vi.fn(async () => ({ path: 'INBOX', release })),
      search,
      fetch: (range) => {
        fetchRanges.push(range);
        return {
          async *[Symbol.asyncIterator]() {
            for (const msg of fetchedMessages) {
              yield msg;
            }
          },
        };
      },
    };

    const result = await fetchFromConnectedImapClient(session, TEST_ACCOUNT, {
      seenUids: new Set(),
      initialFetchCount: 2,
      initialSyncDone: false,
    });

    expect(search).not.toHaveBeenCalled();
    expect(fetchRanges).toEqual(['99:*']);
    expect(result.emails).toHaveLength(2);
    expect(result.emails[0].isRead).toBe(true);
    expect(result.emails[1].isRead).toBe(false);
    expect(result.allUids).toEqual(['100:249', '100:250']);
    expect(result.imapState).toEqual({ uidValidity: '100', lastUid: 250 });
    expect(release).toHaveBeenCalledOnce();
  });

  it('searches only uid (lastUid+1):* incrementally, ignores N:* <= lastUid quirk, and never re-fetches old evicted UIDs', async () => {
    const release = vi.fn();
    // Simulate a 2000-message mailbox where seenUids was trimmed to last 1500 (501..2000),
    // leaving UIDs 1..500 absent from seenUids.
    const seenUids = new Set<string>();
    for (let u = 501; u <= 2000; u++) {
      seenUids.add(`100:${u}`);
    }

    const searchQueries: Array<{ query: unknown; options: unknown }> = [];
    const fetchCalls: Array<{ range: unknown; options: unknown }> = [];

    const session: ImapClientSession = {
      mailbox: makeMailbox({ uidValidity: 100n, exists: 2002, uidNext: 2003 }),
      getMailboxLock: vi.fn(async () => ({ path: 'INBOX', release })),
      search: async (query, options) => {
        searchQueries.push({ query, options });
        // IMAP servers return highest existing UID (2000) when N:* is at/past end alongside new UIDs
        return [2000, 2001, 2002];
      },
      fetch: (range, _query, options) => {
        fetchCalls.push({ range, options });
        const messages: FetchMessageObject[] = [
          { seq: 2001, uid: 2001, source: makeRawEmail('Fresh 2001', 2001), flags: new Set() },
          { seq: 2002, uid: 2002, source: makeRawEmail('Fresh 2002', 2002), flags: new Set() },
        ];
        return {
          async *[Symbol.asyncIterator]() {
            for (const msg of messages) {
              yield msg;
            }
          },
        };
      },
    };

    const result = await fetchFromConnectedImapClient(session, TEST_ACCOUNT, {
      seenUids,
      initialFetchCount: 15,
      initialSyncDone: true,
      imapUidValidity: '100',
      imapLastUid: 2000,
    });

    expect(searchQueries).toEqual([{ query: { uid: '2001:*' }, options: { uid: true } }]);
    expect(fetchCalls).toEqual([{ range: '2001,2002', options: { uid: true } }]);
    expect(result.emails.map((e) => e.uid)).toEqual(['100:2001', '100:2002']);
    expect(result.allUids).toEqual(['100:2001', '100:2002']);
    expect(result.imapState).toEqual({ uidValidity: '100', lastUid: 2002 });
    expect(release).toHaveBeenCalledOnce();
  });

  it('resets high-water mark cleanly when uidValidity changes', async () => {
    const release = vi.fn();
    const search = vi.fn();
    const fetchRanges: unknown[] = [];

    const session: ImapClientSession = {
      mailbox: makeMailbox({ uidValidity: 222n, exists: 20, uidNext: 21 }),
      getMailboxLock: vi.fn(async () => ({ path: 'INBOX', release })),
      search,
      fetch: (range) => {
        fetchRanges.push(range);
        const messages: FetchMessageObject[] = [
          { seq: 19, uid: 19, source: makeRawEmail('Post-reset 19', 19), flags: new Set() },
          { seq: 20, uid: 20, source: makeRawEmail('Post-reset 20', 20), flags: new Set() },
        ];
        return {
          async *[Symbol.asyncIterator]() {
            for (const msg of messages) {
              yield msg;
            }
          },
        };
      },
    };

    const result = await fetchFromConnectedImapClient(session, TEST_ACCOUNT, {
      seenUids: new Set(['111:1999', '111:2000']),
      initialFetchCount: 2,
      initialSyncDone: true,
      imapUidValidity: '111',
      imapLastUid: 2000,
    });

    expect(search).not.toHaveBeenCalled();
    expect(fetchRanges).toEqual(['19:*']);
    expect(result.emails.map((e) => e.uid)).toEqual(['222:19', '222:20']);
    expect(result.imapState).toEqual({ uidValidity: '222', lastUid: 20 });
    expect(release).toHaveBeenCalledOnce();
  });
});
