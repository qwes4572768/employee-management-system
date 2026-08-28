import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { migrate, getSchemaVersion } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { countTenants } from '@/repositories/tenantRepository';
import { listAuditLogs } from '@/repositories/auditRepository';
import { bootstrapSystem } from '@/services/bootstrapService';
import { changeOwnProfile, login, logout, registerAccount, reviewAccount } from '@/services/authService';
import {
  createCustomRole,
  assignRoleToUser,
  updateRolePermissionSet,
  listRolePermissionKeys,
} from '@/services/roleService';
import { assignUserToSite, createSite, getAuthorizedSites, switchCurrentSite } from '@/services/siteService';
import { findAccountGlobally, getUserById } from '@/repositories/userRepository';
import { listSites } from '@/repositories/siteRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import { configureKvStore, loadSession, MemoryKvStore } from '@/services/sessionStore';
import type { ActorContext } from '@/services/actor';
import { formatDateTimeZh } from '@/utils/datetime';
import { hashPassword, verifyPassword, validatePasswordStrength } from '@/utils/password';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  configureKvStore(new MemoryKvStore());
  const tmp = path.join(os.tmpdir(), `qinguan-test-${Date.now()}.db`);
  const db = createBetterSqliteDatabase(tmp);
  setDatabase(db);

  const version = await migrate(db);
  assert(version === 1, `expected schema version 1, got ${version}`);
  assert((await countTenants()) === 0, 'fresh install must be empty');

  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const tableNames = tables.map((row) => row.name);
  const requiredTables = [
    'schema_migrations',
    'tenants',
    'users',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'user_permission_overrides',
    'sites',
    'user_site_permissions',
    'audit_logs',
    'app_state',
  ];
  for (const name of requiredTables) {
    assert(tableNames.includes(name), `missing table ${name}`);
  }

  const weak = validatePasswordStrength('123456', 'admin');
  assert(!weak.ok, 'weak password must fail');
  const hashed = await hashPassword('SafePass#9');
  assert(hashed.hash !== 'SafePass#9', 'password must not be stored in plaintext');
  assert(await verifyPassword('SafePass#9', hashed), 'password verify should succeed');

  const actor: ActorContext = {
    userId: null,
    fullName: '系統',
    account: 'system',
    roleSnapshot: 'SYSTEM',
    tenantId: null,
    siteId: null,
    deviceId: 'device-test-1',
    appVersion: '1.0.0',
  };

  const boot = await bootstrapSystem({
    admin: {
      fullName: '林秋萍',
      phone: '0911000111',
      employeeNo: 'A001',
      gender: 'female',
      hireDate: '2019-03-01',
      jobTitle: '營運長',
      account: 'linqiuping',
      password: 'SafePass#9',
      confirmPassword: 'SafePass#9',
    },
    company: {
      officialName: '晨光保全股份有限公司',
      shortName: '晨光保全',
      taxId: '12345678',
      phone: '0222334455',
      industryType: 'security',
    },
    site: {
      siteCode: 'SITE-001',
      name: '信義總部',
      address: '台北市信義區',
    },
    actor,
  });

  db.close();
  const reopened = createBetterSqliteDatabase(tmp);
  setDatabase(reopened);
  await migrate(reopened);
  assert((await getSchemaVersion(reopened)) === 1, 'reopen migration changed schema unexpectedly');

  const persistedAdmin = await findAccountGlobally('linqiuping');
  assert(persistedAdmin, 'reopened database lost the admin user');

  await logout({
    ...actor,
    userId: persistedAdmin.id,
    fullName: persistedAdmin.fullName,
    account: persistedAdmin.account,
    roleSnapshot: '企業總管理員',
    tenantId: persistedAdmin.tenantId,
  });
  assert(!(await loadSession()), 'session should be cleared after logout');

  const loggedIn = await login('linqiuping', 'SafePass#9', actor);
  assert(loggedIn.id === persistedAdmin.id, 'login did not return the admin');
  assert(await loadSession(), 'session missing after login');

  const adminActor: ActorContext = {
    ...actor,
    userId: loggedIn.id,
    fullName: loggedIn.fullName,
    account: loggedIn.account,
    roleSnapshot: '企業總管理員',
    tenantId: loggedIn.tenantId,
  };

  const updated = await changeOwnProfile(adminActor, loggedIn.id, { jobTitle: '勤務課長' });
  assert(updated.jobTitle === '勤務課長', 'profile update failed');
  const reloadedProfile = await getUserById(loggedIn.id);
  assert(reloadedProfile?.jobTitle === '勤務課長', 'profile did not persist');

  const site2 = await createSite(adminActor, {
    tenantId: boot.tenant.id,
    siteCode: 'SITE-002',
    name: '內湖科技園區',
    address: '台北市內湖區',
  });
  const adminSites = await getAuthorizedSites(updated);
  assert(adminSites.length >= 2, 'expected multiple authorized sites');
  const switched = await switchCurrentSite(updated, site2.id);
  assert(switched.id === site2.id, 'site switch failed');

  const role = await createCustomRole(adminActor, { tenantId: boot.tenant.id, name: '夜班領班' });
  await updateRolePermissionSet(adminActor, boot.tenant.id, role.id, ['sites.view', 'users.view']);
  const keys = await listRolePermissionKeys(role.id);
  assert(keys.includes('sites.view'), 'role permission not saved');

  const pending = await registerAccount(
    boot.tenant,
    {
      fullName: '蕭志遠',
      phone: '0922000222',
      employeeNo: 'B018',
      gender: 'male',
      hireDate: '2024-01-08',
      jobTitle: '保全員',
      account: 'hsiao.zy',
      password: 'GuardPass#1',
      confirmPassword: 'GuardPass#1',
    },
    actor,
  );
  assert(pending.status === 'pending', 'new user must be pending');
  try {
    await login('hsiao.zy', 'GuardPass#1', actor);
    throw new Error('pending user should not enter main app');
  } catch (err) {
    assert(err instanceof Error && err.message.includes('等待主管開通'), 'pending login message mismatch');
  }

  await reviewAccount(adminActor, pending.id, 'active', null);
  await assignRoleToUser(adminActor, {
    tenantId: boot.tenant.id,
    userId: pending.id,
    roleId: role.id,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: pending.fullName,
    roleName: role.name,
  });
  await assignUserToSite(adminActor, {
    tenantId: boot.tenant.id,
    userId: pending.id,
    siteId: site2.id,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: pending.fullName,
    siteName: site2.name,
  });
  const grants = await listUserSitePermissions(pending.id);
  assert(grants.some((grant) => grant.siteId === site2.id), 'site assignment missing');

  const staff = await login('hsiao.zy', 'GuardPass#1', actor);
  assert(staff.status === 'active', 'approved user should be able to login');
  const staffSites = await getAuthorizedSites(staff);
  assert(
    staffSites.some((site) => site.id === site2.id),
    'approved user cannot see assigned site',
  );
  assert(
    !staffSites.some((site) => site.siteCode === 'SITE-001'),
    'staff should not see unassigned site',
  );

  const logs = await listAuditLogs(boot.tenant.id);
  assert(logs.length > 0, 'audit logs missing');
  const profileLog = logs.find((log) => log.description.includes('職稱由「營運長」修改為「勤務課長」'));
  assert(profileLog, 'profile audit description missing human-readable change');
  assert(profileLog.actorNameSnapshot === '林秋萍', 'audit must show real actor name');
  assert(/\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}/.test(formatDateTimeZh(profileLog.createdAt)), 'datetime format wrong');
  assert(
    logs.some((log) => log.description.includes('開通員工「蕭志遠」帳號')),
    'approval audit missing',
  );
  assert(
    logs.some((log) => log.description.includes('授權「蕭志遠」使用案場「內湖科技園區」')),
    'site assign audit missing',
  );
  assert(
    logs.some((log) => log.description.includes('建立角色「夜班領班」')),
    'role create audit missing',
  );

  const allSites = await listSites(boot.tenant.id);
  assert(allSites.length === 2, 'expected two sites');

  await logout({
    ...adminActor,
    fullName: staff.fullName,
    account: staff.account,
    userId: staff.id,
    roleSnapshot: '夜班領班',
  });

  console.log('PHASE1_FLOW_PASSED');
  console.log(`tables=${tableNames.join(',')}`);
  console.log(`schema=${await getSchemaVersion(reopened)} tenants=${await countTenants()} sites=${allSites.length} audits=${logs.length}`);
  reopened.close();
  fs.unlinkSync(tmp);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
