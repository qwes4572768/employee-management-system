import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { migration002 } from '@/database/migrations/002_integrity_constraints';
import { migration003 } from '@/database/migrations/003_workforce_attendance';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import { getWorkScheduleById } from '@/repositories/workforceRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { assignRoleToUser } from '@/services/roleService';
import { assignUserToSite, createSite } from '@/services/siteService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { createSchedule, createShiftTemplate } from '@/services/scheduleService';
import { reviewLeaveRequest, staffingImpactIfApproved, submitLeaveRequest } from '@/services/leaveService';
import { getDashboardSnapshot } from '@/services/dashboardService';
import {
  computeShiftCoverage,
  createStaffingRequirement,
  deactivateStaffingRequirement,
  editStaffingRequirement,
  getStaffingRequirement,
  listStaffingRequirements,
} from '@/services/staffingRequirementService';
import { formatDateTimeZh } from '@/utils/datetime';
import { createId } from '@/utils/id';
import { TenantAccessError } from '@/services/tenantGuard';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p2a1'): ActorContext {
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

function asActor(user: { id: string; fullName: string; account: string; tenantId: string }, siteId?: string | null): ActorContext {
  return {
    userId: user.id,
    fullName: user.fullName,
    account: user.account,
    roleSnapshot: '企業總管理員',
    tenantId: user.tenantId,
    siteId: siteId ?? null,
    deviceId: 'device-admin',
    appVersion: '1.0.0',
  };
}

async function expectFailure(fn: () => Promise<unknown>, needle: string, message: string) {
  try {
    await fn();
    throw new Error(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text === message) throw error;
    assert(text.includes(needle), `${message}: ${text}`);
  }
}

async function seed(name: string, account: string, siteName = '中正名人巷') {
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
      name: siteName,
      address: '台北市',
    },
    actor: systemActor(account),
  });
}

async function openDb() {
  const filename = path.join(os.tmpdir(), `qinguan-p2a1-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  return Object.assign(db, { filename });
}

async function createStaff(
  adminActor: ActorContext,
  tenant: Tenant,
  input: { fullName: string; account: string; siteId: string },
) {
  const pending = await registerAccount(
    tenant,
    {
      fullName: input.fullName,
      phone: '0933000333',
      employeeNo: `E-${input.account}`,
      gender: 'male',
      hireDate: '2024-01-01',
      jobTitle: '保全員',
      account: input.account,
      password: 'GuardPass#1',
      confirmPassword: 'GuardPass#1',
    },
    systemActor(input.account),
  );
  await reviewAccount(adminActor, pending.id, 'active', null);
  const roles = await listRoles(tenant.id);
  const staffRole = roles.find((r) => r.roleKey === 'STAFF');
  assert(staffRole, 'STAFF role missing');
  await assignRoleToUser(adminActor, {
    tenantId: tenant.id,
    userId: pending.id,
    roleId: staffRole.id,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: input.fullName,
    roleName: staffRole.name,
  });
  await assignUserToSite(adminActor, {
    tenantId: tenant.id,
    userId: pending.id,
    siteId: input.siteId,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: input.fullName,
    siteName: 'site',
  });
  const user = await findAccountGlobally(input.account);
  assert(user, 'staff missing');
  return user;
}

async function applyThrough003(db: ReturnType<typeof createBetterSqliteDatabase>) {
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
  await db.exec('PRAGMA foreign_keys = OFF;');
  await migration002.up(db);
  await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
    2,
    '002_integrity_constraints',
    new Date().toISOString(),
  ]);
  await migration003.up(db);
  await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
    3,
    '003_workforce_attendance',
    new Date().toISOString(),
  ]);
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `expected schema ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='site_shift_requirements'`,
  );
  assert(tables.length === 1, 'missing site_shift_requirements');

  const seeded = await seed('勤安', 'p2a1.admin');
  const admin = asActor(seeded.user);
  const sites = await db.getAll<{ id: string; name: string }>(`SELECT id, name FROM sites WHERE tenant_id = ?`, [
    seeded.tenant.id,
  ]);
  const site = sites[0];
  assert(site, 'site missing');

  const day = await createShiftTemplate(admin, { name: '日班', code: 'DAY', startTime: '08:00', endTime: '20:00' });
  const night = await createShiftTemplate(admin, { name: '夜班', code: 'NIGHT', startTime: '20:00', endTime: '08:00' });

  const a = await createStaff(admin, seeded.tenant, { fullName: '林守成', account: 'lin.sc', siteId: site.id });
  const b = await createStaff(admin, seeded.tenant, { fullName: '陳日班', account: 'chen.day', siteId: site.id });
  const c = await createStaff(admin, seeded.tenant, { fullName: '黃日班', account: 'huang.day', siteId: site.id });
  const d = await createStaff(admin, seeded.tenant, { fullName: '張日班', account: 'chang.day', siteId: site.id });
  const nightStaff = await createStaff(admin, seeded.tenant, { fullName: '夜班甲', account: 'night.a', siteId: site.id });
  const nightStaffB = await createStaff(admin, seeded.tenant, { fullName: '夜班乙', account: 'night.b', siteId: site.id });
  const mobile = await createStaff(admin, seeded.tenant, { fullName: '李機動', account: 'li.mobile', siteId: site.id });

  const unset = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: day.id,
  });
  assert(unset.status === 'unknown', 'unset must be unknown');
  assert(unset.requiredHeadcount == null, 'unset must not invent required');
  assert(unset.shortage === 0, 'unset must not fake shortage');

  const dayReq = await createStaffingRequirement(admin, {
    siteId: site.id,
    shiftTemplateId: day.id,
    requiredHeadcount: 3,
    effectiveStartDate: '2026-10-01',
  });
  assert(dayReq.requiredHeadcount === 3, 'day required 3');

  const beforeEffective = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-09-30',
    shiftTemplateId: day.id,
  });
  assert(beforeEffective.status === 'unknown', 'requirement not yet effective');

  await createSchedule(admin, { userId: a.id, siteId: site.id, workDate: '2026-10-10', shiftTemplateId: day.id });
  await createSchedule(admin, { userId: b.id, siteId: site.id, workDate: '2026-10-10', shiftTemplateId: day.id });
  const originallyShort = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: day.id,
  });
  assert(originallyShort.requiredHeadcount === 3, 'req 3');
  assert(originallyShort.scheduledHeadcount === 2, 'scheduled 2');
  assert(originallyShort.remainingHeadcount === 2, 'remaining 2');
  assert(originallyShort.shortage === 1, 'originally short 1');
  assert(originallyShort.status === 'short', 'status short');

  await createSchedule(admin, { userId: c.id, siteId: site.id, workDate: '2026-10-10', shiftTemplateId: day.id });
  await createSchedule(admin, { userId: d.id, siteId: site.id, workDate: '2026-10-20', shiftTemplateId: day.id });
  await createSchedule(admin, { userId: a.id, siteId: site.id, workDate: '2026-10-20', shiftTemplateId: day.id });
  await createSchedule(admin, { userId: b.id, siteId: site.id, workDate: '2026-10-20', shiftTemplateId: day.id });
  await createSchedule(admin, { userId: c.id, siteId: site.id, workDate: '2026-10-20', shiftTemplateId: day.id });

  const fourScheduled = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-20',
    shiftTemplateId: day.id,
  });
  assert(fourScheduled.scheduledHeadcount === 4, 'four scheduled');
  assert(fourScheduled.surplus === 1, 'over by 1 is not an error');
  assert(fourScheduled.status === 'over', 'over status');
  assert(fourScheduled.shortage === 0, 'over is not shortage');

  const actorA = asActor(a, site.id);
  const leaveThree = await submitLeaveRequest(actorA, {
    leaveType: 'annual_leave',
    startDate: '2026-10-10',
    endDate: '2026-10-10',
    siteId: site.id,
  });
  const impactThree = await staffingImpactIfApproved(leaveThree);
  assert(impactThree.impacts.length === 1, 'one affected slot');
  assert(impactThree.impacts[0]?.requiredHeadcount === 3, 'impact required 3');
  assert(impactThree.impacts[0]?.remainingHeadcount === 2, '3 scheduled 1 leaving remaining 2');
  assert(impactThree.impacts[0]?.shortage === 1, 'req3 / scheduled3 / 1 leave → short 1');
  assert(impactThree.impacts[0]?.status === 'short', 'short status');

  await reviewLeaveRequest(admin, leaveThree.id, 'approved');
  const afterThreeLeave = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: day.id,
  });
  assert(afterThreeLeave.shortage === 1, 'approved leave still short 1');

  const leaveFour = await submitLeaveRequest(actorA, {
    leaveType: 'annual_leave',
    startDate: '2026-10-20',
    endDate: '2026-10-20',
    siteId: site.id,
  });
  const impactFour = await staffingImpactIfApproved(leaveFour);
  assert(impactFour.impacts[0]?.requiredHeadcount === 3, 'four-person required 3');
  assert(impactFour.impacts[0]?.remainingHeadcount === 3, '4 scheduled 1 leaving remaining 3');
  assert(impactFour.impacts[0]?.shortage === 0, 'req3 / scheduled4 / 1 leave → not short');
  assert(impactFour.impacts[0]?.status !== 'short', 'must not report shortage');
  await reviewLeaveRequest(admin, leaveFour.id, 'approved');

  await createSchedule(admin, {
    userId: mobile.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: day.id,
    scheduleType: 'replacement',
  });
  const afterReplacement = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: day.id,
  });
  assert(afterReplacement.remainingHeadcount === 3, 'replacement restores remaining 3');
  assert(afterReplacement.shortage === 0, 'replacement clears shortage');
  assert(afterReplacement.status !== 'short', 'no longer short');

  const dash = await getDashboardSnapshot(admin, { siteId: site.id, at: new Date(2026, 9, 10, 10, 0) });
  assert(dash.staffingStats, 'dashboard staffing stats');
  assert(dash.staffingStats.shortage === 0, 'dashboard shortage 0 after replacement');
  assert(!dash.staffingStats.allUnknown, 'requirement is known');

  const nightReq = await createStaffingRequirement(admin, {
    siteId: site.id,
    shiftTemplateId: night.id,
    requiredHeadcount: 2,
    effectiveStartDate: '2026-10-01',
  });
  assert(nightReq.requiredHeadcount === 2, 'night required 2');

  await createSchedule(admin, {
    userId: nightStaff.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: night.id,
  });
  await createSchedule(admin, {
    userId: nightStaffB.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: night.id,
  });
  const nightCoverage = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: night.id,
  });
  assert(nightCoverage.requiredHeadcount === 2, 'night required 2');
  assert(nightCoverage.scheduledHeadcount === 2, 'night scheduled 2');
  assert(nightCoverage.shortage === 0, 'night not short');
  const dayStill = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: day.id,
  });
  assert(dayStill.requiredHeadcount === 3, 'day requirement unchanged by night');

  const edited = await editStaffingRequirement(admin, dayReq.id, { requiredHeadcount: 4 });
  assert(edited.requiredHeadcount === 4, 'updated headcount');
  const logs = await listAuditLogs(seeded.tenant.id);
  const editLog = logs.find((item) => item.description.includes('最低勤務人數由 3 人修改為 4 人'));
  assert(editLog, 'audit log for headcount change');
  assert(editLog.actorNameSnapshot === admin.fullName, 'audit uses real name');
  assert(formatDateTimeZh(editLog.createdAt).includes('年'), 'audit zh datetime');
  const createLog = logs.find((item) => item.description.includes('建立「中正名人巷 / 日班」最低勤務人數為 3 人'));
  assert(createLog, 'create audit with site/shift names');

  await deactivateStaffingRequirement(admin, nightReq.id);
  const deactivateLog = logs.concat(await listAuditLogs(seeded.tenant.id)).find((item) =>
    item.description.includes('停用「中正名人巷 / 夜班」最低勤務人數設定'),
  );
  assert(deactivateLog, 'deactivate audit');
  const nightAfterStop = await computeShiftCoverage({
    tenantId: seeded.tenant.id,
    siteId: site.id,
    workDate: '2026-10-10',
    shiftTemplateId: night.id,
  });
  assert(nightAfterStop.status === 'unknown', 'inactive requirement is unknown');

  const staffActor = asActor(a, site.id);
  await expectFailure(
    () =>
      createStaffingRequirement(staffActor, {
        siteId: site.id,
        shiftTemplateId: day.id,
        requiredHeadcount: 9,
        effectiveStartDate: '2026-10-01',
      }),
    '權限',
    'staff cannot manage requirements',
  );

  const other = await seed('他司', 'other.admin', '他司案場');
  const otherActor = asActor(other.user);
  await expectFailure(() => getStaffingRequirement(otherActor, dayReq.id), '無權', 'cross tenant read');
  const otherRows = await listStaffingRequirements(otherActor);
  assert(!otherRows.some((row) => row.id === dayReq.id), 'cross tenant list must not leak');
  await expectFailure(
    () =>
      createStaffingRequirement(otherActor, {
        siteId: site.id,
        shiftTemplateId: day.id,
        requiredHeadcount: 1,
        effectiveStartDate: '2026-10-01',
      }),
    '無權',
    'cross tenant write',
  );
  try {
    await getStaffingRequirement(otherActor, dayReq.id);
    throw new Error('cross tenant should throw');
  } catch (error) {
    assert(error instanceof TenantAccessError || (error instanceof Error && error.message.includes('無權')), 'tenant isolation type');
  }

  db.close();
  fs.unlinkSync(db.filename);

  const upgradeFile = path.join(os.tmpdir(), `qinguan-p2a1-up-${createId()}.db`);
  const up = createBetterSqliteDatabase(upgradeFile);
  setDatabase(up);
  configureKvStore(new MemoryKvStore());
  await applyThrough003(up);
  assert((await getSchemaVersion(up)) === 3, 'setup schema 3');
  const before = await seed('升級二A', 'up2a1.admin');
  const admin2 = asActor(before.user);
  const siteRow = await up.getFirst<{ id: string }>(`SELECT id FROM sites WHERE tenant_id = ?`, [before.tenant.id]);
  assert(siteRow, 'upgrade site');
  const shift = await createShiftTemplate(admin2, { name: '日班', code: 'DAY-UP', startTime: '08:00', endTime: '20:00' });
  const guard = await createStaff(admin2, before.tenant, { fullName: '升級人員', account: 'up.guard', siteId: siteRow.id });
  const kept = await createSchedule(admin2, {
    userId: guard.id,
    siteId: siteRow.id,
    workDate: '2026-12-01',
    shiftTemplateId: shift.id,
  });
  const logsBefore = await listAuditLogs(before.tenant.id);
  const afterV = await migrate(up);
  assert(afterV === CURRENT_SCHEMA_VERSION, 'upgrade 003 → 004');
  assert((await findAccountGlobally('up2a1.admin'))?.id === before.user.id, 'upgrade kept user');
  assert(await getWorkScheduleById(kept.id, before.tenant.id), 'upgrade kept phase 2A schedule');
  assert((await listAuditLogs(before.tenant.id)).length === logsBefore.length, 'upgrade kept audit');
  const reqTable = await up.getAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE name='site_shift_requirements'`);
  assert(reqTable.length === 1, '004 table after upgrade');
  up.close();
  fs.unlinkSync(upgradeFile);

  console.log('Phase 2A.1 tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
