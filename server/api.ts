import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { findAccountGlobally, getUserById, getUserSecret } from '@/repositories/userRepository';
import { countTenants } from '@/repositories/tenantRepository';
import { verifyPassword } from '@/utils/password';
import { getEffectivePermissionKeys, roleSnapshotForUser } from '@/services/permissionService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { systemActor, type ActorContext } from '@/services/actor';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import type { User } from '@/types';

export interface RpcContext { actor: ActorContext; user: User }
export type RpcHandler = (context: RpcContext, input: unknown) => Promise<unknown>;
export interface ApiServerOptions {
  databasePath: string;
  handlers?: Readonly<Record<string, RpcHandler>>;
  setupKey?: string;
  allowedOrigins?: string[];
  sessionTtlMs?: number;
  maxBodyBytes?: number;
  loginLimit?: number;
  loginWindowMs?: number;
  now?: () => number;
}
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

// Existing repositories use a process-global adapter. All API instances share one queue.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(task);
  queue = next;
  return next;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function equalSecret(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_REQUEST', '請檢查請求內容');
  return value as Record<string, unknown>;
}
function onlyKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some(key => !keys.includes(key))) throw new ApiError(400, 'INVALID_REQUEST', '請求含有不支援的欄位');
}
async function jsonBody(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', '請使用 JSON');
  if (Number(req.headers['content-length'] ?? 0) > limit) {
    req.resume();
    throw new ApiError(413, 'BODY_TOO_LARGE', '資料超過大小限制');
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new ApiError(413, 'BODY_TOO_LARGE', '資料超過大小限制');
    chunks.push(bytes);
  }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'INVALID_JSON', 'JSON 格式不正確'); }
}
interface SessionRow { token_hash: string; user_id: string; tenant_id: string; expires_at: number; credential_fingerprint: string }

export async function createApiServer(options: ApiServerOptions) {
  const databasePath = options.databasePath === ':memory:' ? ':memory:' : resolve(options.databasePath);
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = createBetterSqliteDatabase(databasePath);
  const kv = new MemoryKvStore();
  const now = options.now ?? Date.now;
  const ttl = options.sessionTtlMs ?? 12 * 60 * 60 * 1000;
  const maxBody = options.maxBodyBytes ?? 64 * 1024;
  const origins = new Set(options.allowedOrigins ?? []);
  if (origins.has('*')) { db.close(); throw new Error('CORS 必須指定完整來源，不可使用 *'); }
  const handlers = new Map(Object.entries(options.handlers ?? {}));
  const attempts = new Map<string, { count: number; until: number }>();
  const limit = options.loginLimit ?? 10;
  const windowMs = options.loginWindowMs ?? 15 * 60 * 1000;
  let pending = 0;
  let closed = false;
  const inDatabase = <T>(fn: () => Promise<T>) => serial(async () => {
    if (closed) throw new ApiError(503, 'UNAVAILABLE', '服務暫時無法使用');
    setDatabase(db);
    configureKvStore(kv);
    return fn();
  });
  await inDatabase(async () => {
    await migrate(db);
    await db.exec(`CREATE TABLE IF NOT EXISTS server_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL, credential_fingerprint TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    ); CREATE INDEX IF NOT EXISTS server_sessions_expiry ON server_sessions(expires_at);
    CREATE TRIGGER IF NOT EXISTS server_revoke_inactive_sessions AFTER UPDATE OF status ON users
    WHEN NEW.status <> 'active'
    BEGIN DELETE FROM server_sessions WHERE user_id = NEW.id; END;`);
  }).catch(error => { db.close(); throw error; });

  function throttle(req: IncomingMessage, account: string, kind = 'login') {
    const time = now();
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    if (attempts.size > 5000) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '嘗試次數過多，請稍後再試');
    const keys = [`${kind}:ip:${req.socket.remoteAddress ?? 'unknown'}`, `${kind}:account:${digest(account.toLowerCase())}`];
    if (keys.some(key => (attempts.get(key)?.count ?? 0) >= limit)) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', '嘗試次數過多，請稍後再試');
    for (const key of keys) {
      const entry = attempts.get(key) ?? { count: 0, until: time + windowMs };
      entry.count++;
      attempts.set(key, entry);
    }
    return () => {
      for (const key of keys) {
        const entry = attempts.get(key);
        if (entry) entry.count = Math.max(0, entry.count - 1);
      }
    };
  }
  function tokenFrom(req: IncomingMessage): string {
    const auth = req.headers.authorization;
    if (!auth || !/^Bearer [A-Za-z0-9_-]{43}$/.test(auth)) throw new ApiError(401, 'UNAUTHENTICATED', '請重新登入');
    return auth.slice(7);
  }
  async function authenticate(req: IncomingMessage): Promise<RpcContext> {
    const tokenHash = digest(tokenFrom(req));
    const session = await db.getFirst<SessionRow>('SELECT * FROM server_sessions WHERE token_hash = ?', [tokenHash]);
    if (!session || session.expires_at <= now()) {
      await db.run('DELETE FROM server_sessions WHERE token_hash = ?', [tokenHash]);
      throw new ApiError(401, 'UNAUTHENTICATED', '請重新登入');
    }
    const user = await getUserById(session.user_id, session.tenant_id);
    const secret = user ? await getUserSecret(user.id) : null;
    if (!user || user.status !== 'active' || !secret || digest(JSON.stringify(secret)) !== session.credential_fingerprint) {
      await db.run('DELETE FROM server_sessions WHERE token_hash = ?', [tokenHash]);
      throw new ApiError(401, 'UNAUTHENTICATED', '請重新登入');
    }
    return { user, actor: {
      userId: user.id, tenantId: user.tenantId, fullName: user.fullName, account: user.account,
      roleSnapshot: await roleSnapshotForUser(user.id, user.tenantId), siteId: null,
      deviceId: 'shared-api', appVersion: '1.0.0',
    } };
  }
  function send(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) { send(res, 403, { error: { code: 'ORIGIN_DENIED', message: '不允許此來源' } }); return; }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Setup-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (pending >= 64) { send(res, 503, { error: { code: 'BUSY', message: '服務忙碌，請稍後重試' } }); return; }
    pending++;
    void (async () => {
      const path = req.url?.split('?')[0];
      const body = req.method === 'POST' ? await jsonBody(req, maxBody) : {};
      const result = await inDatabase(async () => {
        if (path === '/health' && req.method === 'GET') return { ready: true, bootstrapNeeded: (await countTenants()) === 0 };
        if (path === '/bootstrap' && req.method === 'POST') {
          throttle(req, 'setup', 'setup');
          if (!options.setupKey || !equalSecret(String(req.headers['x-setup-key'] ?? ''), options.setupKey)) throw new ApiError(401, 'SETUP_DENIED', '初始化驗證失敗');
          if ((await countTenants()) !== 0) throw new ApiError(409, 'ALREADY_INITIALIZED', '系統已初始化');
          onlyKeys(body, ['admin', 'company', 'site']);
          object(body.admin); object(body.company);
          // Never accept the caller's actor or a caller-selected database.
          await db.withTransaction(() => bootstrapSystem({
            admin: body.admin as Parameters<typeof bootstrapSystem>[0]['admin'],
            company: body.company as Parameters<typeof bootstrapSystem>[0]['company'],
            site: body.site as Parameters<typeof bootstrapSystem>[0]['site'],
            actor: systemActor('shared-api-setup', '1.0.0'),
          }));
          return { initialized: true };
        }
        if (path === '/session' && req.method === 'POST') {
          onlyKeys(body, ['account', 'password']);
          if (typeof body.account !== 'string' || typeof body.password !== 'string' || body.account.length > 128 || body.password.length > 128) throw new ApiError(400, 'INVALID_REQUEST', '請輸入帳號與密碼');
          const account = body.account.trim();
          const accepted = throttle(req, account);
          const user = await findAccountGlobally(account);
          const secret = user ? await getUserSecret(user.id) : null;
          const valid = secret ? await verifyPassword(body.password, { algo: secret.password_algo, iterations: secret.password_iterations, salt: secret.password_salt, hash: secret.password_hash }) : false;
          if (!valid || !user || user.status !== 'active' || !secret) throw new ApiError(401, 'LOGIN_FAILED', '帳號、密碼或帳號狀態不正確');
          accepted();
          const token = randomBytes(32).toString('base64url');
          const expiresAt = now() + ttl;
          await db.run('DELETE FROM server_sessions WHERE expires_at <= ?', [now()]);
          await db.run('INSERT INTO server_sessions(token_hash,user_id,tenant_id,expires_at,credential_fingerprint) VALUES(?,?,?,?,?)', [digest(token), user.id, user.tenantId, expiresAt, digest(JSON.stringify(secret))]);
          return { token, expiresAt, user };
        }
        if (path === '/session' && req.method === 'DELETE') {
          await db.run('DELETE FROM server_sessions WHERE token_hash = ?', [digest(tokenFrom(req))]);
          return { loggedOut: true };
        }
        if (path === '/session' && req.method === 'GET') {
          const context = await authenticate(req);
          return { ...context, permissionKeys: await getEffectivePermissionKeys(context.user) };
        }
        if (path === '/rpc' && req.method === 'POST') {
          const context = await authenticate(req);
          onlyKeys(body, ['method', 'input']);
          const handler = typeof body.method === 'string' ? handlers.get(body.method) : undefined;
          if (!handler) throw new ApiError(404, 'UNKNOWN_METHOD', '不支援此操作');
          return handler(context, body.input);
        }
        throw new ApiError(404, 'NOT_FOUND', '找不到此服務');
      });
      send(res, 200, result ?? null);
    })().catch((error: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof ApiError) {
        if (error.status === 429) res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        send(res, error.status, { error: { code: error.code, message: error.message } });
      } else {
        // Internal errors may contain SQL, paths or secrets. Never return their text.
        send(res, 400, { error: { code: 'OPERATION_FAILED', message: '操作未完成，請確認資料、權限與目前狀態' } });
      }
    }).finally(() => { pending--; });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return {
    server,
    async close() {
      if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      await serial(async () => { closed = true; db.close(); });
    },
  };
}
