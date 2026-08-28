import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { migrate, getSchemaVersion } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { countTenants } from '@/repositories/tenantRepository';
import { listAuditLogs } from '@/repositories/auditRepository';
import { bootstrapSystem } from '@/services/bootstrapService';
import { changeOwnProfile, login, logout, registerAccount, reviewAccount } from '@/services/authService';
import { createCustomRole, assignRoleToUser, updateRolePermissionSet, listRolePermissionKeys } from '@/services/roleService';
import { createSite, getAuthorizedSites, switchCurrentSite } from '@/services/siteService';
import { findAccountGlobally } from '@/repositories/userRepository';
import { listSites } from '@/repositories/siteRepository';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
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
  assert((await getSchemaVersion(db)) === 1, 'schema version not persisted');

  const weak = validatePasswordStrength('123456', 'admin');
  assert(!weak.ok, 'weak password must fail');

  const hashed = await hashPassword('SafePass#9');
  assert(hashed.hash !== 'SafePass#9', 'password must not be stored in plaintext');
  assert(await verifyPassword('SafePass#9', hashed), 'password verify should succeed');
  assert(!(await verifyPassword('wrong', hashed)), 'wrong password should fail');

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

  assert(boot.user.fullName === '林秋萍', 'admin name mismatch');
  const adminActor: ActorContext = {
    ...actor,
    userId: boot.user.id,
    fullName: boot.user.fullName,
    account: boot.user.account,
    roleSnapshot: '企業總管理員',
    tenantId: boot.tenant.id,
  };

  const reopened = createBetterSqliteDatabase(tmp);
  setDatabase(reopened);
  await migrate(reopened);
  const existing = await findAccountGlobally('linqiuping');
  assert(existing, 'reopened database lost the admin user');
  assert(existing.fullName === '林秋萍', 'persisted name mismatch');

  await login('linqiuping', 'SafePass#9', adminActor);

  const updated = await changeOwnProfile(adminActor, boot.user.id, { jobTitle: '勤務課長' });
  assert(updated.jobTitle === '勤務課長', 'profile update failed');

  const site2 = await createSite(adminActor, {
    tenantId: boot.tenant.id,
    siteCode: 'SITE-002',
    name: '內湖科技園區',
    address: '台北市內湖區',
  });
  const sites = await getAuthorizedSites(updated);
  assert(sites.length >= 2, 'expected multiple authorized sites');
  const switched = await switchCurrentSite(updated, site2.id);
  assert(switched.id === site2.id, 'site switch failed');

  const role = await createCustomRole(adminActor, { tenantId: boot.tenant.id, name: '夜班領班' });
  assert(role.roleKey.startsWith('CUSTOM_'), 'custom role key should be stable and not Chinese');
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

  const logs = await listAuditLogs(boot.tenant.id);
  assert(logs.length > 0, 'audit logs missing');
  const profileLog = logs.find((log) => log.description.includes('職稱由「營運長」修改為「勤務課長」'));
  assert(profileLog, 'profile audit description missing human-readable change');
  assert(profileLog.actorNameSnapshot === '林秋萍', 'audit must show real actor name');
  const formatted = formatDateTimeZh(profileLog.createdAt);
  assert(/\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}/.test(formatted), `datetime format wrong: ${formatted}`);

  const createdSiteLog = logs.find((log) => log.description.includes('建立案場「內湖科技園區」'));
  assert(createdSiteLog, 'site create audit missing');
  const approveLog = logs.find((log) => log.description.includes('開通員工「蕭志遠」帳號'));
  assert(approveLog, 'approval audit missing');

  const allSites = await listSites(boot.tenant.id);
  assert(allSites.length === 2, 'expected two sites');

  await logout(adminActor);
  console.log('PHASE1_TESTS_PASSED');
  console.log(`schema=${await getSchemaVersion(reopened)} tenants=${await countTenants()} sites=${allSites.length} audits=${logs.length}`);
  reopened.close();
  fs.unlinkSync(tmp);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
