import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fetchPop3Emails,
  formatPop3CommandError,
  testPop3Connection,
} from '../src/main/mail/pop3Client';
import type { AccountConfig } from '../src/shared/types';

function createMockPop3Server(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const sampleMime = [
    'From: Alice <alice@example.com>',
    'To: me@example.com',
    'Subject: Hello from Mock POP3',
    'Message-ID: <msg-1@example.com>',
    'Date: Fri, 21 Nov 2026 10:00:00 +0900',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'First line of message.',
    '..Dot-stuffed line should unstuff to single dot.',
    'Last line.',
  ].join('\r\n');

  const server = net.createServer((socket) => {
    socket.write('+OK Mock POP3 server ready\r\n');
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (true) {
        const idx = buffer.indexOf('\r\n');
        if (idx < 0) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);

        const [cmd, arg] = line.split(' ');
        const upper = (cmd || '').toUpperCase();

        if (upper === 'USER' || upper === 'PASS') {
          socket.write('+OK accepted\r\n');
        } else if (upper === 'STAT') {
          socket.write('+OK 1 256\r\n');
        } else if (upper === 'UIDL') {
          socket.write('+OK\r\n1 uid-alpha-1\r\n.\r\n');
        } else if (upper === 'RETR' && arg === '1') {
          socket.write(`+OK ${Buffer.byteLength(sampleMime)} octets\r\n${sampleMime}\r\n.\r\n`);
        } else if (upper === 'QUIT') {
          socket.write('+OK bye\r\n');
          socket.end();
        } else {
          socket.write('-ERR unknown command\r\n');
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe('pop3Client', () => {
  let closeServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  it('connects, authenticates, lists UIDL, and unstuffs RETR email', async () => {
    const srv = await createMockPop3Server();
    closeServer = srv.close;

    const account: AccountConfig = {
      id: 'pop-test',
      name: 'Test POP3',
      email: 'me@example.com',
      protocol: 'pop3',
      host: '127.0.0.1',
      port: srv.port,
      secure: false,
      starttls: false,
      username: 'me@example.com',
      password: 'secret',
      smtpHost: '127.0.0.1',
      smtpPort: 465,
      smtpSecure: true,
      enabled: true,
      color: '#2563EB',
    };

    const testRes = await testPop3Connection(account);
    expect(testRes.ok).toBe(true);
    expect(testRes.inboxCount).toBe(1);

    const fetched = await fetchPop3Emails(account, {
      seenUids: new Set(),
      initialFetchCount: 10,
      initialSyncDone: false,
    });

    expect(fetched.allUids).toEqual(['uid-alpha-1']);
    expect(fetched.emails).toHaveLength(1);
    expect(fetched.emails[0].subject).toBe('Hello from Mock POP3');
    expect(fetched.emails[0].fromName).toBe('Alice');
    expect(fetched.emails[0].fromAddress).toBe('alice@example.com');
    expect(fetched.emails[0].isKorean).toBe(false);
    expect(fetched.emails[0].textBody).toContain('.Dot-stuffed line should unstuff to single dot.');
    expect(fetched.emails[0].textBody).not.toContain('..Dot-stuffed');
  });

  it('rejects cleanly when PASS returns -ERR from mock server', async () => {
    const errServer = net.createServer((socket) => {
      socket.write('+OK Gpop ready\r\n');
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        while (true) {
          const idx = buf.indexOf('\r\n');
          if (idx < 0) break;
          const line = buf.slice(0, idx).trim().toUpperCase();
          buf = buf.slice(idx + 2);
          if (line.startsWith('USER')) {
            socket.write('+OK send PASS\r\n');
          } else if (line.startsWith('PASS')) {
            socket.write('-ERR [SYS/PERM] Your account is not enabled for POP access.\r\n');
          } else if (line.startsWith('QUIT')) {
            socket.write('+OK Bye\r\n');
            socket.end();
          }
        }
      });
    });

    await new Promise<void>((resolve) => errServer.listen(0, '127.0.0.1', resolve));
    const addr = errServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    closeServer = () => new Promise<void>((res) => errServer.close(() => res()));

    const account: AccountConfig = {
      id: 'pop-err-test',
      name: 'Err POP3',
      email: 'me@gmail.com',
      protocol: 'pop3',
      host: '127.0.0.1',
      port,
      secure: false,
      starttls: false,
      username: 'me@gmail.com',
      password: 'bad',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      enabled: true,
      color: '#2563EB',
    };

    await expect(testPop3Connection(account)).rejects.toThrow(
      'POP3 오류 (PASS): -ERR [SYS/PERM] Your account is not enabled for POP access.'
    );
  });

  it('appends Korean Gmail POP3 guidance for pop.gmail.com error responses', () => {
    const disabledMsg = formatPop3CommandError(
      'pop.gmail.com',
      'PASS',
      '-ERR [SYS/PERM] Your account is not enabled for POP access.'
    );
    expect(disabledMsg).toContain("POP 사용");

    const authMsg = formatPop3CommandError(
      'pop.gmail.com',
      'PASS',
      '-ERR [AUTH] Username and password not accepted.'
    );
    expect(authMsg).toContain('앱 비밀번호');
    expect(authMsg).toContain('POP 사용');

    const otherMsg = formatPop3CommandError(
      'pop.example.com',
      'PASS',
      '-ERR [AUTH] Authentication failed.'
    );
    expect(otherMsg).toBe('POP3 오류 (PASS): -ERR [AUTH] Authentication failed.');
  });
});
