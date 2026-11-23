import net from 'node:net';
import tls from 'node:tls';
import type { AccountConfig, ConnectionTestResult, EmailMessage } from '../../shared/types';
import { parseRawEmail } from './parser';

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_POP3_INCREMENTAL_FETCH = 30;
const CRLF = Buffer.from('\r\n', 'ascii');
const MULTILINE_END = Buffer.from('\r\n.\r\n', 'ascii');
const OK_PREFIX = Buffer.from('+OK', 'ascii');
const ERR_PREFIX = Buffer.from('-ERR', 'ascii');

export function formatPop3CommandError(host: string, cmdName: string, firstLine: string): string {
  const cleanLine = firstLine.trim();
  const base = `POP3 오류 (${cmdName}): ${cleanLine}`;
  if (host.toLowerCase().includes('gmail.com')) {
    if (/not enabled for pop/i.test(cleanLine)) {
      return `${base} — Gmail 웹 설정(전달 및 POP/IMAP)에서 'POP 사용'을 켜고 변경사항을 저장해 주세요.`;
    }
    if (/\[AUTH\]|username and password not accepted|application-specific/i.test(cleanLine)) {
      return `${base} — Gmail 2단계 인증 '앱 비밀번호'와 전체 이메일 주소(@gmail.com)를 입력했는지, 그리고 Gmail 설정에서 POP 사용이 켜져 있는지 확인해 주세요.`;
    }
  }
  return base;
}

interface Pop3FetchOptions {
  seenUids: Set<string>;
  initialFetchCount: number;
  initialSyncDone: boolean;
}

export interface Pop3FetchResult {
  emails: EmailMessage[];
  allUids: string[];
}

class Pop3Session {
  private socket: net.Socket | tls.TLSSocket;
  private readonly host: string;
  private buffer = Buffer.alloc(0);
  private pendingResolve: ((data: Buffer) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private expectingMultiline = false;
  private closed = false;

  private constructor(socket: net.Socket | tls.TLSSocket, host: string) {
    this.socket = socket;
    this.host = host;
    this.attachListeners(socket);
  }

  static async connect(account: AccountConfig): Promise<Pop3Session> {
    const useDirectTls = account.secure;
    const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error(`POP3 연결 시간이 초과되었습니다 (${account.host}:${account.port})`));
      }, DEFAULT_TIMEOUT_MS);

      const onError = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      const sock = useDirectTls
        ? tls.connect(
            {
              host: account.host,
              port: account.port,
              servername: account.host,
            },
            () => {
              clearTimeout(timer);
              sock.off('error', onError);
              resolve(sock);
            }
          )
        : net.connect(
            {
              host: account.host,
              port: account.port,
            },
            () => {
              clearTimeout(timer);
              sock.off('error', onError);
              resolve(sock);
            }
          );

      sock.once('error', onError);
    });

    const session = new Pop3Session(socket, account.host);
    // Read initial server greeting (+OK ...)
    const greeting = (await session.waitResponse(false)).toString('utf8');
    if (!greeting.startsWith('+OK')) {
      session.destroy();
      throw new Error(`POP3 서버 응답 오류: ${greeting.trim()}`);
    }

    if (!useDirectTls && account.starttls) {
      await session.command('STLS');
      await session.upgradeToTls(account.host);
    }

    return session;
  }

  private attachListeners(socket: net.Socket | tls.TLSSocket): void {
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.tryResolve();
    });

    socket.on('error', (err: Error) => {
      if (this.pendingReject) {
        const reject = this.pendingReject;
        this.clearPending();
        reject(err);
      }
    });

    socket.on('close', () => {
      this.closed = true;
      if (this.pendingReject) {
        const reject = this.pendingReject;
        this.clearPending();
        reject(new Error('POP3 연결이 예상치 않게 종료되었습니다.'));
      }
    });
  }

  private clearPending(): void {
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  private async upgradeToTls(servername: string): Promise<void> {
    const plainSocket = this.socket;
    plainSocket.removeAllListeners('data');
    plainSocket.removeAllListeners('error');
    plainSocket.removeAllListeners('close');

    const tlsSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const sock = tls.connect(
        {
          socket: plainSocket,
          servername,
        },
        () => resolve(sock)
      );
      sock.once('error', reject);
    });

    this.socket = tlsSocket;
    this.buffer = Buffer.alloc(0);
    this.attachListeners(tlsSocket);
  }

  private tryResolve(): void {
    if (!this.pendingResolve) return;

    const firstLineEnd = this.buffer.indexOf(CRLF);
    if (firstLineEnd < 0) return;

    if (!this.expectingMultiline) {
      const lineEnd = firstLineEnd + CRLF.length;
      const lineBuf = this.buffer.subarray(0, lineEnd);
      this.buffer = this.buffer.subarray(lineEnd);

      const resolve = this.pendingResolve;
      this.clearPending();
      resolve(lineBuf);
      return;
    }

    // Multiline response: first line may be -ERR (single line!) or +OK ... terminated by \r\n.\r\n
    const firstLineBuf = this.buffer.subarray(0, firstLineEnd + CRLF.length);
    if (firstLineBuf.subarray(0, ERR_PREFIX.length).equals(ERR_PREFIX)) {
      this.buffer = this.buffer.subarray(firstLineEnd + CRLF.length);
      const resolve = this.pendingResolve;
      this.clearPending();
      resolve(firstLineBuf);
      return;
    }

    const terminatorIdx = this.buffer.indexOf(MULTILINE_END, firstLineEnd);
    if (terminatorIdx < 0) return;

    const payloadEnd = terminatorIdx + MULTILINE_END.length;
    const fullPayload = this.buffer.subarray(0, payloadEnd);
    this.buffer = this.buffer.subarray(payloadEnd);

    const resolve = this.pendingResolve;
    this.clearPending();
    resolve(fullPayload);
  }

  private waitResponse(multiline: boolean): Promise<Buffer> {
    if (this.closed) {
      return Promise.reject(new Error('POP3 연결이 닫혀 있습니다.'));
    }

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingReject === wrappedReject) {
          this.clearPending();
          reject(new Error('POP3 명령 응답 시간이 초과되었습니다.'));
        }
      }, DEFAULT_TIMEOUT_MS);

      const wrappedResolve = (data: Buffer) => {
        clearTimeout(timer);
        resolve(data);
      };
      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      this.expectingMultiline = multiline;
      this.pendingResolve = wrappedResolve;
      this.pendingReject = wrappedReject;
      this.tryResolve();
    });
  }

  async commandBuffer(cmd: string, multiline = false): Promise<Buffer> {
    const responsePromise = this.waitResponse(multiline);
    this.socket.write(`${cmd}\r\n`);
    const response = await responsePromise;
    if (!response.subarray(0, OK_PREFIX.length).equals(OK_PREFIX)) {
      const firstLine = response.toString('utf8').split('\r\n')[0] ?? '';
      const cmdName = cmd.split(' ')[0] ?? cmd;
      throw new Error(formatPop3CommandError(this.host, cmdName, firstLine));
    }
    return response;
  }

  async command(cmd: string, multiline = false): Promise<string> {
    const response = await this.commandBuffer(cmd, multiline);
    return response.toString('utf8');
  }

  async login(username: string, password: string): Promise<void> {
    await this.command(`USER ${username}`);
    await this.command(`PASS ${password}`);
  }

  async stat(): Promise<{ count: number; size: number }> {
    const res = await this.command('STAT');
    const parts = res.trim().split(/\s+/);
    return {
      count: Number.parseInt(parts[1] ?? '0', 10) || 0,
      size: Number.parseInt(parts[2] ?? '0', 10) || 0,
    };
  }

  async uidl(): Promise<Array<{ msgNum: number; uid: string }>> {
    const res = await this.command('UIDL', true);
    const lines = res.split('\r\n').slice(1);
    const entries: Array<{ msgNum: number; uid: string }> = [];
    for (const line of lines) {
      if (line === '.' || !line.trim()) continue;
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx <= 0) continue;
      const msgNum = Number.parseInt(line.slice(0, spaceIdx), 10);
      const uid = line.slice(spaceIdx + 1).trim();
      if (!Number.isNaN(msgNum) && uid) {
        entries.push({ msgNum, uid });
      }
    }
    return entries;
  }

  async retr(msgNum: number): Promise<Buffer> {
    const res = await this.commandBuffer(`RETR ${msgNum}`, true);
    const firstCrlf = res.indexOf(CRLF);
    const bodyStart = firstCrlf >= 0 ? firstCrlf + CRLF.length : 0;
    const hasTerminator =
      res.length >= MULTILINE_END.length &&
      res.subarray(res.length - MULTILINE_END.length).equals(MULTILINE_END);
    const bodyEnd = hasTerminator ? res.length - MULTILINE_END.length : res.length;
    const bodyBuf = bodyEnd > bodyStart ? res.subarray(bodyStart, bodyEnd) : Buffer.alloc(0);

    // RFC 1939 dot-unstuffing using 1:1 latin1 mapping to preserve non-UTF8 bytes losslessly
    return Buffer.from(bodyBuf.toString('latin1').replace(/(^|\r\n)\.\./g, '$1.'), 'latin1');
  }

  async quit(): Promise<void> {
    try {
      if (!this.closed) {
        await this.command('QUIT');
      }
    } catch {
      // ignore quit errors on teardown
    } finally {
      this.destroy();
    }
  }

  destroy(): void {
    if (!this.closed) {
      this.closed = true;
      this.socket.destroy();
    }
  }
}

export async function testPop3Connection(account: AccountConfig): Promise<ConnectionTestResult> {
  const session = await Pop3Session.connect(account);
  try {
    await session.login(account.username, account.password);
    const { count } = await session.stat();
    return {
      ok: true,
      message: `POP3 연결 성공 (메시지 ${count}통)`,
      inboxCount: count,
    };
  } finally {
    await session.quit();
  }
}

export async function fetchPop3Emails(
  account: AccountConfig,
  options: Pop3FetchOptions
): Promise<Pop3FetchResult> {
  const session = await Pop3Session.connect(account);
  try {
    await session.login(account.username, account.password);
    const entries = await session.uidl();
    const allUids = entries.map((e) => e.uid);

    const unseen = entries.filter((e) => !options.seenUids.has(e.uid));
    const toFetch = options.initialSyncDone
      ? unseen.slice(-MAX_POP3_INCREMENTAL_FETCH)
      : unseen.slice(-Math.max(1, options.initialFetchCount));

    const emails: EmailMessage[] = [];
    for (const item of toFetch) {
      const raw = await session.retr(item.msgNum);
      const parsed = await parseRawEmail(raw, account.id, item.uid);
      emails.push(parsed);
    }

    return { emails, allUids };
  } finally {
    await session.quit();
  }
}
