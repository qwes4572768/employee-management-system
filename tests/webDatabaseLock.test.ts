import assert from 'node:assert/strict';

import { acquireWebDatabaseLock, databaseInitializationError, DATABASE_BUSY_MESSAGE } from '@/database/webDatabaseLock';
import { createRetryableInitializer } from '@/database/retryableInitializer';

async function main() {
  let attempts = 0;
  const db = {};
  const initialize = createRetryableInitializer(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Temporary failure');
    return db;
  });
  const firstAttempt = initialize();
  assert.equal(firstAttempt, initialize(), 'Concurrent callers must share the same open attempt');
  await assert.rejects(firstAttempt, /Temporary failure/);
  assert.equal(await initialize(), db, 'Retry must recover from a failed open');
  assert.equal(await initialize(), db);
  assert.equal(attempts, 2, 'Successful opens must stay cached');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const held = new Set<string>();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: {
      async request(name: string, _options: unknown, callback: (lock: object | null) => Promise<void>) {
        if (held.has(name)) return callback(null);
        held.add(name);
        try { await callback({ name }); } finally { held.delete(name); }
      },
    },
  } });
  try {
    const releaseFirst = await acquireWebDatabaseLock('company.sqlite');
    await assert.rejects(acquireWebDatabaseLock('company.sqlite'), { message: DATABASE_BUSY_MESSAGE });
    // An unrelated database must not block this app.
    const releaseOther = await acquireWebDatabaseLock('other.sqlite');
    releaseOther();
    releaseFirst();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const releaseRetry = await acquireWebDatabaseLock('company.sqlite');
    releaseRetry();
    assert.equal(databaseInitializationError(new DOMException('Access Handles cannot be created', 'NoModificationAllowedError')).message, DATABASE_BUSY_MESSAGE);
    const diskError = new Error('Disk full');
    assert.equal(databaseInitializationError(diskError), diskError);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    (await acquireWebDatabaseLock('company.sqlite'))();
    console.log('PASS: concurrent initialization, failed open recovery, second tab blocked, owner release/retry, independent database, legacy error mapping');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
