import {
  ImapFlow,
  type FetchMessageObject,
  type FetchOptions,
  type FetchQueryObject,
  type MailboxLockObject,
  type MailboxObject,
  type SearchObject,
  type SequenceString,
} from 'imapflow';
import type { AccountConfig, ConnectionTestResult, EmailMessage } from '../../shared/types';
import { parseRawEmail } from './parser';

const MAX_INCREMENTAL_FETCH = 50;

export interface ImapFetchOptions {
  seenUids: Set<string>;
  initialFetchCount: number;
  initialSyncDone: boolean;
  imapUidValidity?: string;
  imapLastUid?: number;
}

export interface ImapSyncState {
  uidValidity: string;
  lastUid: number;
}

export interface ImapFetchResult {
  emails: EmailMessage[];
  allUids: string[];
  imapState?: ImapSyncState;
}

export interface ImapClientSession {
  mailbox: MailboxObject | false;
  getMailboxLock: (path: string | string[]) => Promise<MailboxLockObject>;
  search: (query: SearchObject, options?: { uid?: boolean }) => Promise<number[] | false>;
  fetch: (
    range: SequenceString | number[] | SearchObject,
    query: FetchQueryObject,
    options?: FetchOptions
  ) => AsyncIterable<FetchMessageObject>;
}

export interface ManagedImapClient {
  client: ImapFlow;
  getLastError: () => Error | null;
}

export function deriveHighWaterMark(
  seenUids: Set<string>,
  uidValidity: string,
  savedUidValidity?: string,
  savedLastUid?: number
): number {
  if (
    savedUidValidity === uidValidity &&
    typeof savedLastUid === 'number' &&
    Number.isFinite(savedLastUid) &&
    savedLastUid > 0
  ) {
    return Math.floor(savedLastUid);
  }

  const prefix = `${uidValidity}:`;
  let highest = 0;
  for (const key of seenUids) {
    if (!key.startsWith(prefix)) continue;
    const rawUid = key.slice(prefix.length);
    if (!/^\d+$/.test(rawUid)) continue;
    const uid = Number(rawUid);
    if (Number.isSafeInteger(uid) && uid > highest) {
      highest = uid;
    }
  }
  return highest;
}

export function createImapClient(account: AccountConfig): ManagedImapClient {
  let lastError: Error | null = null;

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: {
      user: account.username,
      pass: account.password,
    },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });

  // ImapFlow extends EventEmitter and emits 'error' on socket timeout/disconnect;
  // attaching a listener prevents Node from raising an Uncaught Exception.
  client.on('error', (err: Error) => {
    lastError = err;
  });

  return {
    client,
    getLastError: () => lastError,
  };
}

async function closeImapClient(managed: ManagedImapClient): Promise<void> {
  const { client, getLastError } = managed;
  if (getLastError() || !client.usable) {
    client.close();
    return;
  }
  try {
    await Promise.race([
      client.logout(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // ignore logout error during teardown
  } finally {
    client.close();
  }
}

export async function testImapConnection(account: AccountConfig): Promise<ConnectionTestResult> {
  const managed = createImapClient(account);
  const { client } = managed;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const count = client.mailbox && typeof client.mailbox === 'object'
        ? client.mailbox.exists ?? 0
        : 0;
      return {
        ok: true,
        message: `IMAP 연결 성공 (받은편지함 ${count}통)`,
        inboxCount: count,
      };
    } finally {
      lock.release();
    }
  } catch (err) {
    throw managed.getLastError() ?? err;
  } finally {
    await closeImapClient(managed);
  }
}

export async function fetchFromConnectedImapClient(
  client: ImapClientSession,
  account: AccountConfig,
  options: ImapFetchOptions
): Promise<ImapFetchResult> {
  const lock = await client.getMailboxLock('INBOX');
  try {
    const mailboxInfo = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
    const uidValidity = mailboxInfo?.uidValidity ? String(mailboxInfo.uidValidity) : '0';
    const exists = Number(mailboxInfo?.exists ?? 0);
    const uidNext = Number(mailboxInfo?.uidNext ?? 0);
    const lastUid = deriveHighWaterMark(
      options.seenUids,
      uidValidity,
      options.imapUidValidity,
      options.imapLastUid
    );

    if (exists === 0) {
      return {
        emails: [],
        allUids: [],
        imapState: {
          uidValidity,
          lastUid: Math.max(lastUid, uidNext > 1 ? uidNext - 1 : 0),
        },
      };
    }

    if (options.initialSyncDone && lastUid > 0 && uidNext > 0 && uidNext <= lastUid + 1) {
      return {
        emails: [],
        allUids: [],
        imapState: {
          uidValidity,
          lastUid,
        },
      };
    }

    if (!options.initialSyncDone || lastUid === 0) {
      const fetchCount = Math.max(1, options.initialFetchCount);
      const startSeq = Math.max(1, exists - fetchCount + 1);
      const emails: EmailMessage[] = [];
      const allUids: string[] = [];
      let maxFetchedUid = 0;

      for await (const msg of client.fetch(`${startSeq}:*`, {
        uid: true,
        source: true,
        flags: true,
      })) {
        if (typeof msg.uid === 'number' && msg.uid > 0) {
          maxFetchedUid = Math.max(maxFetchedUid, msg.uid);
          allUids.push(`${uidValidity}:${msg.uid}`);
        }
        if (!msg.source) continue;
        const uidKey = `${uidValidity}:${msg.uid}`;
        const parsed = await parseRawEmail(msg.source, account.id, uidKey);
        if (!options.initialSyncDone && msg.flags?.has('\\Seen')) {
          parsed.isRead = true;
        }
        emails.push(parsed);
      }

      const nextLastUid = Math.max(maxFetchedUid, uidNext > 1 ? uidNext - 1 : 0);
      return {
        emails,
        allUids,
        imapState: {
          uidValidity,
          lastUid: nextLastUid,
        },
      };
    }

    const searchResult = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
    const rawUids = Array.isArray(searchResult) ? searchResult : [];
    // IMAP ranges like N:* always include the highest UID even when it is <= lastUid.
    const sortedNewUids = Array.from(new Set(rawUids))
      .filter((uid) => uid > lastUid && !options.seenUids.has(`${uidValidity}:${uid}`))
      .sort((a, b) => a - b);

    const toFetch = sortedNewUids.slice(-MAX_INCREMENTAL_FETCH);
    const emails: EmailMessage[] = [];

    if (toFetch.length > 0) {
      const uidList = toFetch.join(',');
      for await (const msg of client.fetch(
        uidList,
        { uid: true, source: true, flags: true },
        { uid: true }
      )) {
        if (!msg.source) continue;
        const uidKey = `${uidValidity}:${msg.uid}`;
        const parsed = await parseRawEmail(msg.source, account.id, uidKey);
        emails.push(parsed);
      }
    }

    const nextLastUid = Math.max(lastUid, ...sortedNewUids, uidNext > 1 ? uidNext - 1 : 0);
    return {
      emails,
      allUids: sortedNewUids.map((uid) => `${uidValidity}:${uid}`),
      imapState: {
        uidValidity,
        lastUid: nextLastUid,
      },
    };
  } finally {
    lock.release();
  }
}

export async function fetchImapEmails(
  account: AccountConfig,
  options: ImapFetchOptions
): Promise<ImapFetchResult> {
  const managed = createImapClient(account);
  const { client } = managed;

  try {
    await client.connect();
    return await fetchFromConnectedImapClient(client, account, options);
  } catch (err) {
    throw managed.getLastError() ?? err;
  } finally {
    await closeImapClient(managed);
  }
}
