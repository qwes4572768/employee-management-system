import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL, permissionIdForKey } from '@/database/migrations';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase, type SqlDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { countActiveOverrides, countActiveUserRoles } from '@/repositories/permissionRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import { countActiveSiteGrants } from '@/repositories/userSiteRepository';
import type { ActorContext } from '@/services/actor';
import { login, registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { getEffectivePermissionKeys, getEffectiveRoles } from '@/services/permissionService';
import {
  addUserPermissionOverride,
  assignRoleToUser,
  createCustomRole,
  updateRolePermissionSet,
} from '@/services/roleService';
import { assignUserToSite, createSite, editSite, getAuthorizedSites } from '@/services/siteService';
import { TENANT_ISOLATION_MESSAGE } from '@/services/tenantGuard';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { createId } from '@/utils/id';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function systemActor(suffix = 'integrity'): ActorContext {
  return {
    userId: null,
    fullName: '系統',
    account: 'system',
    roleSnapshot: 'SYSTEM',
    tenantId: null,
    siteId: null,
    deviceId: `device-${suffix}`,
    appVersion: '1.0.0',
  };
}

async function openDb(): Promise<SqlDatabase & { close: () => void; filename: string }> {
  const filename = path.join(os.tmpdir(), `qinguan-integrity-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  return Object.assign(db, { filename });
}

function adminActor(user: { id: string; fullName: string; account: string; tenantId: string }): ActorContext {
  return {
    ...systemActor('admin'),
    userId: user.id,
    fullName: user.fullName,
    account: user.account,
    roleSnapshot: '企業總管理員',
    tenantId: user.tenantId,
  };
}

async function seedCompany(name: string, account: string) {
  return bootstrapSystem({
    admin: {
      fullName: `${name}管理員`,
      phone: '0911000111',
      employeeNo: 'A001',
      gender: 'female',
      hireDate: '2019-03-01',
      jobTitle: '營運長',
      account,
      password: 'SafePass#9',
      confirmPassword: 'SafePass#9',
    },
    company: {
      officialName: `${name}保全股份有限公司`,
      shortName: name,
      taxId: '12345678',
      phone: '0222334455',
      industryType: 'security',
    },
    site: {
      siteCode: 'SITE-001',
      name: `${name}總部`,
      address: '台北市',
    },
    actor: systemActor(account),
  });
}

async function expectFailure(fn: () => Promise<unknown>, needle: string, message: string) {
  try {
    await fn();
    throw new Error(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text === message) {
      throw error;
    }
    assert(text.includes(needle), `${message}: ${text}`);
  }
}

async function testFreshInstall(db: SqlDatabase) {
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected v${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(await isForeignKeysEnabled(db), 'PRAGMA foreign_keys must be ON');
}

async function testUpgradeFrom001() {
  const filename = path.join(os.tmpdir(), `qinguan-upgrade-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  await db.exec(MIGRATION_001_SQL);
  await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
    1,
    '001_initial',
    new Date().toISOString(),
  ]);
  assert((await getSchemaVersion(db)) === 1, 'setup should be schema 1');

  const seeded = await seedCompany('升級測試', 'upgrade.admin');
  const userBefore = await findAccountGlobally('upgrade.admin');
  assert(userBefore, 'admin missing before upgrade');
  const logsBefore = await listAuditLogs(seeded.tenant.id);

  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `upgrade expected v${CURRENT_SCHEMA_VERSION}, got ${version}`);
  const userAfter = await findAccountGlobally('upgrade.admin');
  assert(userAfter?.id === userBefore.id, 'existing user lost after upgrade');
  const logsAfter = await listAuditLogs(seeded.tenant.id);
  assert(logsAfter.length === logsBefore.length, 'audit rows changed during upgrade');
  assert(logsAfter[0]?.actorNameSnapshot, 'audit snapshot missing after upgrade');
  assert(await isForeignKeysEnabled(db), 'foreign keys should be re-enabled after upgrade');

  db.close();
  fs.unlinkSync(filename);
}

async function testForeignKeyRejectsInvalidRelation(db: SqlDatabase) {
  await expectFailure(
    () =>
      db.run(
        `INSERT INTO users (
          id, tenant_id, full_name, gender, account,
          password_hash, password_salt, password_algo, password_iterations,
          status, created_at, updated_at, version, sync_status
        ) VALUES (?, ?, ?, 'unspecified', ?, 'h', 's', 'pbkdf2-sha256', 1, 'active', ?, ?, 1, 'local')`,
        ['orphan-user', 'missing-tenant', '幽靈帳號', 'ghost.account', new Date().toISOString(), new Date().toISOString()],
      ),
    'FOREIGN KEY',
    'invalid tenant_id should fail foreign key',
  );
}

async function testDuplicateGrantsAndExpiry() {
  const db = await openDb();
  await migrate(db);
  const seeded = await seedCompany('授權測試', 'grant.admin');
  const actor = adminActor(seeded.user);
  const site = await createSite(actor, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-GRANT',
    name: '授權案場',
  });
  const role = await createCustomRole(actor, { tenantId: seeded.tenant.id, name: '臨時領班' });
  await updateRolePermissionSet(actor, seeded.tenant.id, role.id, ['sites.view', 'audit.viewAuditLog']);

  const pending = await registerAccount(
    seeded.tenant,
    {
      fullName: '陳守成',
      phone: '0933000333',
      employeeNo: 'C021',
      gender: 'male',
      hireDate: '2024-05-01',
      jobTitle: '保全員',
      account: 'chen.sc',
      password: 'GuardPass#1',
      confirmPassword: 'GuardPass#1',
    },
    systemActor('register'),
  );
  await reviewAccount(actor, pending.id, 'active', null);

  const expired = new Date(Date.now() - 60_000).toISOString();
  await assignRoleToUser(actor, {
    tenantId: seeded.tenant.id,
    userId: pending.id,
    roleId: role.id,
    startsAt: null,
    expiresAt: expired,
    isPermanent: false,
    targetName: pending.fullName,
    roleName: role.name,
  });
  await assignRoleToUser(actor, {
    tenantId: seeded.tenant.id,
    userId: pending.id,
    roleId: role.id,
    startsAt: null,
    expiresAt: expired,
    isPermanent: false,
    targetName: pending.fullName,
    roleName: role.name,
  });
  assert(
    (await countActiveUserRoles(pending.id, role.id, seeded.tenant.id)) === 1,
    'duplicate active role grants were created',
  );

  await assignUserToSite(actor, {
    tenantId: seeded.tenant.id,
    userId: pending.id,
    siteId: site.id,
    startsAt: null,
    expiresAt: expired,
    isPermanent: false,
    targetName: pending.fullName,
    siteName: site.name,
  });
  await assignUserToSite(actor, {
    tenantId: seeded.tenant.id,
    userId: pending.id,
    siteId: site.id,
    startsAt: null,
    expiresAt: expired,
    isPermanent: false,
    targetName: pending.fullName,
    siteName: site.name,
  });
  assert(
    (await countActiveSiteGrants(pending.id, site.id, seeded.tenant.id)) === 1,
    'duplicate active site grants were created',
  );

  await addUserPermissionOverride(actor, {
    tenantId: seeded.tenant.id,
    userId: pending.id,
    permKey: 'audit.viewAuditLog',
    effect: 'allow',
    startsAt: null,
    expiresAt: expired,
    isPermanent: false,
    targetName: pending.fullName,
  });
  await addUserPermissionOverride(actor, {
    tenantId: seeded.tenant.id,
    userId: pending.id,
    permKey: 'audit.viewAuditLog',
    effect: 'deny',
    startsAt: null,
    expiresAt: expired,
    isPermanent: false,
    targetName: pending.fullName,
  });
  assert(
    (await countActiveOverrides(pending.id, permissionIdForKey('audit.viewAuditLog'), seeded.tenant.id)) === 1,
    'contradictory active permission overrides were created',
  );

  const staff = await login('chen.sc', 'GuardPass#1', systemActor('staff-login'));
  const roles = await getEffectiveRoles(staff.id, staff.tenantId);
  assert(!roles.some((item) => item.id === role.id), 'expired role should not be effective');
  const sites = await getAuthorizedSites(staff);
  assert(!sites.some((item) => item.id === site.id), 'expired site grant should hide the site');
  const keys = await getEffectivePermissionKeys(staff);
  assert(!keys.includes('audit.viewAuditLog'), 'expired override should not apply');

  const logs = await listAuditLogs(seeded.tenant.id);
  assert(
    logs.some((log) => log.description.includes('更新「陳守成」的角色「臨時領班」授權')),
    'role grant update audit missing',
  );
  assert(
    logs.some((log) => log.description.includes('更新「陳守成」的案場「授權案場」授權')),
    'site grant update audit missing',
  );
  assert(
    logs.every((log) => log.actorNameSnapshot.length > 0 && log.actorAccountSnapshot.length > 0),
    'audit snapshots must survive grant updates',
  );

  await expectFailure(
    () =>
      db.run(
        `INSERT INTO user_roles (
          id, tenant_id, user_id, role_id, starts_at, expires_at, is_permanent,
          created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
        ) VALUES (?, ?, ?, ?, NULL, NULL, 1, NULL, ?, ?, NULL, 1, 'local', NULL)`,
        [createId(), seeded.tenant.id, pending.id, role.id, new Date().toISOString(), new Date().toISOString()],
      ),
    'UNIQUE',
    'database unique index should reject duplicate active role grants',
  );

  db.close();
  fs.unlinkSync(db.filename);
}

async function testCrossTenantIsolation() {
  const db = await openDb();
  await migrate(db);
  const tenantA = await seedCompany('甲公司', 'tenant.a');
  const tenantB = await seedCompany('乙公司', 'tenant.b');
  const actorA = adminActor(tenantA.user);
  const actorB = adminActor(tenantB.user);
  const siteB = (await getAuthorizedSites(tenantB.user))[0];
  assert(siteB, 'tenant B should have a site');

  await expectFailure(
    () => editSite(actorA, siteB.id, { name: '盜用案場' }),
    TENANT_ISOLATION_MESSAGE,
    'cross-tenant site edit must be rejected',
  );
  await expectFailure(
    () => reviewAccount(actorA, tenantB.user.id, 'returned', null),
    TENANT_ISOLATION_MESSAGE,
    'cross-tenant account review must be rejected',
  );
  await expectFailure(
    () =>
      assignRoleToUser(actorA, {
        tenantId: tenantA.tenant.id,
        userId: tenantB.user.id,
        roleId: 'not-used',
        startsAt: null,
        expiresAt: null,
        isPermanent: true,
        targetName: tenantB.user.fullName,
        roleName: '企業總管理員',
      }),
    TENANT_ISOLATION_MESSAGE,
    'cross-tenant role assign must be rejected',
  );
  await expectFailure(
    () =>
      assignUserToSite(actorA, {
        tenantId: tenantA.tenant.id,
        userId: tenantA.user.id,
        siteId: siteB.id,
        startsAt: null,
        expiresAt: null,
        isPermanent: true,
        targetName: tenantA.user.fullName,
        siteName: siteB.name,
      }),
    TENANT_ISOLATION_MESSAGE,
    'cross-tenant site assign must be rejected',
  );
  await expectFailure(
    () =>
      assignUserToSite(actorB, {
        tenantId: tenantB.tenant.id,
        userId: tenantA.user.id,
        siteId: siteB.id,
        startsAt: null,
        expiresAt: null,
        isPermanent: true,
        targetName: tenantA.user.fullName,
        siteName: siteB.name,
      }),
    TENANT_ISOLATION_MESSAGE,
    'assigning tenant A user into tenant B must be rejected',
  );

  db.close();
  fs.unlinkSync(db.filename);
}

async function testAuditSurvivesUserDelete() {
  const db = await openDb();
  await migrate(db);
  const seeded = await seedCompany('稽核保全', 'audit.admin');
  const actor = adminActor(seeded.user);
  const pending = await registerAccount(
    seeded.tenant,
    {
      fullName: '黃證據',
      phone: '0944000444',
      employeeNo: 'D044',
      gender: 'male',
      hireDate: '2023-09-09',
      jobTitle: '保全員',
      account: 'huang.ev',
      password: 'GuardPass#1',
      confirmPassword: 'GuardPass#1',
    },
    systemActor('audit-reg'),
  );
  await reviewAccount(actor, pending.id, 'active', null);
  const before = await listAuditLogs(seeded.tenant.id);
  const evidence = before.find((log) => log.targetDisplayName === '黃證據');
  assert(evidence, 'approval audit missing');
  assert(evidence.actorNameSnapshot === seeded.user.fullName, 'actor snapshot missing');

  await db.run('DELETE FROM user_roles WHERE user_id = ?', [pending.id]);
  await db.run('DELETE FROM user_site_permissions WHERE user_id = ?', [pending.id]);
  await db.run('DELETE FROM user_permission_overrides WHERE user_id = ?', [pending.id]);
  await db.run('DELETE FROM users WHERE id = ?', [pending.id]);

  const after = await listAuditLogs(seeded.tenant.id);
  const kept = after.find((log) => log.id === evidence.id);
  assert(kept, 'audit log was deleted with the user');
  assert(kept.actorNameSnapshot === evidence.actorNameSnapshot, 'actor name snapshot changed');
  assert(kept.actorAccountSnapshot === evidence.actorAccountSnapshot, 'actor account snapshot changed');
  assert(kept.targetDisplayName === '黃證據', 'target display name snapshot lost');

  db.close();
  fs.unlinkSync(db.filename);
}

async function main() {
  const fresh = await openDb();
  await testFreshInstall(fresh);
  await testForeignKeyRejectsInvalidRelation(fresh);
  fresh.close();
  fs.unlinkSync(fresh.filename);

  await testUpgradeFrom001();
  await testDuplicateGrantsAndExpiry();
  await testCrossTenantIsolation();
  await testAuditSurvivesUserDelete();

  console.log('PHASE1_INTEGRITY_PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
