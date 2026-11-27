import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStore } from '../src/main/store';
import type { EmailMessage } from '../src/shared/types';

function makeEmail(id: string, accountId: string, date: string): EmailMessage {
  return {
    id,
    accountId,
    uid: id,
    fromName: 'Tester',
    fromAddress: 'tester@example.com',
    to: ['me@example.com'],
    subject: `Subject ${id}`,
    date,
    snippet: 'snippet',
    textBody: 'body',
    isKorean: false,
    isRead: false,
    attachments: [],
  };
}

describe('AppStore bulk and all email deletion', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createTempStore(): AppStore {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkachi-store-test-'));
    tempDirs.push(dir);
    return new AppStore(path.join(dir, 'data.json'), {
      encrypt: (plain) => plain,
      decrypt: (cipher) => cipher,
    });
  }

  it('deletes multiple selected emails while leaving unselected ones intact', () => {
    const store = createTempStore();
    store.addEmails([
      makeEmail('e1', 'acc-1', '2026-11-27T01:00:00.000Z'),
      makeEmail('e2', 'acc-1', '2026-11-27T02:00:00.000Z'),
      makeEmail('e3', 'acc-2', '2026-11-27T03:00:00.000Z'),
    ]);

    store.deleteEmails(['e1', 'e3']);

    const remaining = store.getEmails();
    expect(remaining.map((e) => e.id)).toEqual(['e2']);
  });

  it('deletes all emails for a specific account or across all accounts while keeping seenUids', () => {
    const store = createTempStore();
    store.addSeenUids('acc-1', ['uid-1', 'uid-2']);
    store.addEmails([
      makeEmail('e1', 'acc-1', '2026-11-27T01:00:00.000Z'),
      makeEmail('e2', 'acc-1', '2026-11-27T02:00:00.000Z'),
      makeEmail('e3', 'acc-2', '2026-11-27T03:00:00.000Z'),
    ]);

    store.deleteAllEmails('acc-1');
    expect(store.getEmails().map((e) => e.id)).toEqual(['e3']);
    expect(store.getSeenUids('acc-1')).toEqual(new Set(['uid-1', 'uid-2']));

    store.deleteAllEmails();
    expect(store.getEmails()).toEqual([]);
  });
});
