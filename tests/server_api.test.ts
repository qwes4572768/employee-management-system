import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createApiServer } from '@/server/api';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getTenantById } from '@/repositories/tenantRepository';
import { registerAccount, reviewAccount, changeOwnPassword } from '@/services/authService';
import { setAccountStatus } from '@/services/userService';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'qinguan-server-'));
  const databasePath = join(dir, 'api.db');
  let time = Date.now();
  let count = 0;
  const setupKey = 'test-only-setup-key';
  const password = 'ServerTest#2026';
  const api = await createApiServer({
    databasePath, setupKey, allowedOrigins: ['https://allowed.example'], now: () => time,
    sessionTtlMs: 60_000, loginLimit: 4, maxBodyBytes: 8192,
    handlers: {
      identity: async ({ actor }) => ({ actor }),
      register: async ({ user, actor }, input) => registerAccount((await getTenantById(user.tenantId))!, input as Parameters<typeof registerAccount>[1], actor),
      approve: async ({ actor }, input) => reviewAccount(actor, String(input), 'active', null),
      suspend: async ({ actor }, input) => setAccountStatus(actor, String(input), 'suspended'),
      restore: async ({ actor }, input) => setAccountStatus(actor, String(input), 'active'),
      password: async ({ actor, user }) => changeOwnPassword(actor, user.id, password, 'RotatedTest#2026', 'RotatedTest#2026'),
      increment: async () => { const before = count; await new Promise<void>(done => setImmediate(done)); count = before + 1; return count; },
      failure: async () => { throw new Error('SELECT password_hash FROM server_sessions secret-value /private/db'); },
    },
  });
  await new Promise<void>(done => api.server.listen(0, '127.0.0.1', done));
  const address = api.server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  async function call(path: string, method = 'GET', body?: unknown, token?: string, headers: Record<string, string> = {}) {
    const response = await fetch(url + path, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  }
  const rpc = (method: string, input: unknown, token: string) => call('/rpc', 'POST', { method, input }, token);
  let adminToken = '';
  try {
    assert.deepEqual((await call('/health')).body, { ready: true, bootstrapNeeded: true });
    assert.equal((await call('/session')).status, 401);
    assert.equal((await call('/health', 'GET', undefined, undefined, { Origin: 'https://evil.example' })).status, 403);
    const cors = await call('/health', 'GET', undefined, undefined, { Origin: 'https://allowed.example' });
    assert.equal(cors.headers.get('access-control-allow-origin'), 'https://allowed.example');
    assert.equal(cors.headers.get('access-control-allow-credentials'), null);
    const setup = {
      admin: { fullName: '測試董事長', phone: '0900000000', employeeNo: 'ADMIN', gender: 'male', hireDate: '2026-01-01', jobTitle: '董事長', account: 'server.admin', password, confirmPassword: password },
      company: { officialName: '測試共享公司', shortName: '共享', taxId: '12345678', phone: '0200000000', industryType: 'security' },
      site: { siteCode: 'SERVER', name: '共享案場', address: '測試' },
    };
    assert.equal((await call('/bootstrap', 'POST', setup)).status, 401);
    assert.equal((await call('/bootstrap', 'POST', setup, undefined, { 'X-Setup-Key': setupKey })).status, 200);
    assert.equal((await call('/bootstrap', 'POST', setup, undefined, { 'X-Setup-Key': setupKey })).status, 409);
    assert.deepEqual((await call('/health')).body, { ready: true, bootstrapNeeded: false });
    const signed = await call('/session', 'POST', { account: setup.admin.account, password });
    assert.equal(signed.status, 200);
    adminToken = signed.body.token;
    assert.equal(adminToken.length, 43);
    const stored = createBetterSqliteDatabase(databasePath);
    const storedSession = await stored.getFirst<{ token_hash: string; credential_fingerprint: string }>('SELECT token_hash, credential_fingerprint FROM server_sessions');
    assert.equal(storedSession?.token_hash, createHash('sha256').update(adminToken).digest('hex'));
    assert.notEqual(storedSession?.credential_fingerprint, adminToken);
    stored.close();
    const adminId = signed.body.user.id;
    assert(!JSON.stringify(signed.body).includes('password_hash'));
    assert.equal((await call('/session', 'GET', undefined, adminToken)).body.actor.userId, adminId);
    assert.equal((await rpc('arbitrary.sql', 'DELETE FROM users', adminToken)).status, 404);
    assert.equal((await call('/rpc', 'POST', { method: 'identity', input: null, actor: { userId: 'fake' } }, adminToken)).status, 400);
    assert.equal((await rpc('identity', { actor: { userId: 'fake' } }, adminToken)).body.actor.userId, adminId);
    const results = await Promise.all(Array.from({ length: 12 }, () => rpc('increment', null, adminToken)));
    assert.deepEqual(results.map(r => r.body).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
    const failure = await rpc('failure', null, adminToken);
    assert.equal(failure.status, 400);
    assert(!/SELECT|secret-value|password_hash|private|stack/.test(JSON.stringify(failure.body)));
    assert.equal((await call('/rpc', 'POST', { method: 'identity', input: 'x'.repeat(9000) }, adminToken)).status, 413);
    const registered = await rpc('register', { fullName: '一般保全', phone: '0900000001', employeeNo: 'GUARD', gender: 'male', hireDate: '2026-01-01', jobTitle: '保全', account: 'server.guard', password, confirmPassword: password }, adminToken);
    assert.equal(registered.status, 200);
    const guardId = registered.body.id;
    assert.equal((await call('/session', 'POST', { account: 'server.guard', password })).status, 401);
    assert.equal((await rpc('approve', guardId, adminToken)).status, 200);
    const guardLogin = await call('/session', 'POST', { account: 'server.guard', password });
    const guardToken = guardLogin.body.token;
    assert.equal((await rpc('suspend', adminId, guardToken)).status, 400);
    assert.equal((await rpc('suspend', guardId, adminToken)).status, 200);
    assert.equal((await rpc('identity', null, guardToken)).status, 401);
    assert.equal((await rpc('restore', guardId, adminToken)).status, 200);
    assert.equal((await rpc('identity', null, guardToken)).status, 401, 'revoked token cannot revive after restoring account');
    const freshGuard = (await call('/session', 'POST', { account: 'server.guard', password })).body.token;
    await rpc('suspend', guardId, adminToken);
    await rpc('restore', guardId, adminToken);
    assert.equal((await call('/session', 'GET', undefined, freshGuard)).status, 401, 'suspend/restore revokes tokens even without an intervening request');
    const passwordToken = (await call('/session', 'POST', { account: 'server.guard', password })).body.token;
    assert.equal((await rpc('password', null, passwordToken)).status, 200);
    assert.equal((await call('/session', 'GET', undefined, passwordToken)).status, 401);
    const nextGuard = (await call('/session', 'POST', { account: 'server.guard', password: 'RotatedTest#2026' })).body.token;
    assert.equal((await call('/session', 'DELETE', undefined, nextGuard)).status, 200);
    assert.equal((await call('/session', 'GET', undefined, nextGuard)).status, 401);
    time += 60_001;
    assert.equal((await call('/session', 'GET', undefined, adminToken)).status, 401);
    for (let i = 0; i < 3; i++) assert.equal((await call('/session', 'POST', { account: 'nobody', password: 'wrong' })).status, 401);
    assert.equal((await call('/session', 'POST', { account: 'nobody', password: 'wrong' })).status, 429);
  } finally { await api.close(); }
  const inspect = createBetterSqliteDatabase(databasePath);
  const plaintext = await inspect.getFirst('SELECT * FROM server_sessions WHERE token_hash = ?', [adminToken]);
  assert.equal(plaintext, null);
  assert.equal(createHash('sha256').update(adminToken).digest('hex').length, 64);
  inspect.close();
  assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
  assert(dir.startsWith(join(tmpdir(), 'qinguan-server-')));
  rmSync(dir, { recursive: true, force: true });
  console.log('SERVER_API_PASSED: bootstrap/auth/actor isolation/session revocation/expiry/serialization/body/CORS/throttle/error redaction');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
