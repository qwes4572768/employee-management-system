import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { migration002 } from '@/database/migrations/002_integrity_constraints';
import { migration003 } from '@/database/migrations/003_workforce_attendance';
import { migration004 } from '@/database/migrations/004_site_shift_requirements';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { insertQrAsset, getQrAssetByCode, getQrAssetById } from '@/repositories/qrAssetRepository';
import { listQrScanLogs } from '@/repositories/qrScanLogRepository';
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
import { clockIn } from '@/services/attendanceService';
import { startWorkSession } from '@/services/workSessionService';
import { setMockLocationResult, resetLocationProvider } from '@/services/locationProvider';
import {
  deactivateQrAssetByActor,
  issueEmployeeQr,
  issueSiteQr,
  reactivateQrAssetByActor,
} from '@/services/qrAssetService';
import { resetQrScanCooldown, scanQr } from '@/services/qrScannerService';
import { exportQrPng } from '@/services/qrRenderService';
import { formatDateTimeZh } from '@/utils/datetime';
import { createId } from '@/utils/id';
import { QR_ASSET_TYPES } from '@/constants/qr';
import { buildQrPayload } from '@/utils/qrPayload';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p2b1'): ActorContext {
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

function asActor(
  user: { id: string; fullName: string; account: string; tenantId: string },
  siteId?: string | null,
  roleSnapshot = '企業總管理員',
): ActorContext {
  return {
    userId: user.id,
    fullName: user.fullName,
    account: user.account,
    roleSnapshot,
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
  const filename = path.join(os.tmpdir(), `qinguan-p2b1-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  resetLocationProvider();
  resetQrScanCooldown();
  return Object.assign(db, { filename });
}

async function createUser(
  adminActor: ActorContext,
  tenant: Tenant,
  input: { fullName: string; account: string; siteId: string; roleKey: 'STAFF' | 'MANAGER' },
) {
  const pending = await registerAccount(
    tenant,
    {
      fullName: input.fullName,
      phone: '0933000333',
      employeeNo: `E-${input.account}`,
      gender: 'male',
      hireDate: '2024-01-01',
      jobTitle: input.roleKey === 'MANAGER' ? '主管' : '保全員',
      account: input.account,
      password: 'GuardPass#1',
      confirmPassword: 'GuardPass#1',
    },
    systemActor(input.account),
  );
  await reviewAccount(adminActor, pending.id, 'active', null);
  const roles = await listRoles(tenant.id);
  const role = roles.find((item) => item.roleKey === input.roleKey);
  assert(role, `${input.roleKey} missing`);
  await assignRoleToUser(adminActor, {
    tenantId: tenant.id,
    userId: pending.id,
    roleId: role.id,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: input.fullName,
    roleName: role.name,
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
  assert(user, 'user missing');
  return user;
}

async function applyMigration(db: ReturnType<typeof createBetterSqliteDatabase>, version: number, name: string, up: unknown) {
  if (typeof up === 'function') {
    await (up as (database: typeof db) => Promise<void>)(db);
  } else if (typeof up === 'string') {
    await db.exec(up);
  }
  await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
    version,
    name,
    new Date().toISOString(),
  ]);
}

async function applyThrough004(db: ReturnType<typeof createBetterSqliteDatabase>) {
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
  await applyMigration(db, 2, '002_integrity_constraints', migration002.up);
  await applyMigration(db, 3, '003_workforce_attendance', migration003.up);
  await applyMigration(db, 4, '004_site_shift_requirements', migration004.up);
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('qr_assets', 'qr_scan_logs')`,
  );
  assert(tables.length === 2, 'qr tables missing');

  const seeded = await seed('勤安', 'p2b1.admin');
  const admin = asActor(seeded.user);
  const sites = await db.getAll<{ id: string; name: string }>(`SELECT id, name FROM sites WHERE tenant_id = ?`, [
    seeded.tenant.id,
  ]);
  const siteA = sites[0];
  assert(siteA, 'site A');
  const siteB = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-B',
    name: '龍潭寶地',
    address: '桃園',
    latitude: 24.9,
    longitude: 121.2,
    attendanceRadius: 150,
    requireGps: true,
  });
  await db.run(`UPDATE sites SET latitude = 25.033, longitude = 121.565, attendance_radius = 150, require_gps = 1 WHERE id = ?`, [
    siteA.id,
  ]);

  const day = await createShiftTemplate(admin, { name: '日班', code: 'DAY', startTime: '08:00', endTime: '20:00' });
  const guard = await createUser(admin, seeded.tenant, {
    fullName: '林守成',
    account: 'lin.qr',
    siteId: siteA.id,
    roleKey: 'STAFF',
  });
  const otherGuard = await createUser(admin, seeded.tenant, {
    fullName: '陳他場',
    account: 'chen.other',
    siteId: siteB.id,
    roleKey: 'STAFF',
  });
  const scopedManager = await createUser(admin, seeded.tenant, {
    fullName: '黃主管',
    account: 'huang.mgr',
    siteId: siteB.id,
    roleKey: 'MANAGER',
  });
  const staffActor = asActor(guard, siteA.id, '一般勤務人員');
  const managerActor = asActor(scopedManager, siteB.id, '主管');

  const employeeQr = await issueEmployeeQr(admin, guard.id);
  assert(employeeQr.assetType === QR_ASSET_TYPES.EMPLOYEE, 'employee type');
  assert(employeeQr.status === 'active', 'employee active');
  assert(employeeQr.qrCode.startsWith('QINGUAN:v1:'), 'payload prefix');
  assert(employeeQr.targetId === guard.id, 'target user');

  await expectFailure(() => issueEmployeeQr(staffActor, otherGuard.id), '權限', 'staff cannot issue for others');
  await expectFailure(() => issueEmployeeQr(admin, guard.id), '已有有效', 'only one active employee QR');

  const regenerated = await issueEmployeeQr(admin, guard.id, true);
  assert(regenerated.id !== employeeQr.id, 'new qr id');
  const oldAfter = await getQrAssetById(employeeQr.id, seeded.tenant.id);
  assert(oldAfter?.status === 'inactive', 'old qr inactive');
  const stillActive = await getQrAssetByCode(regenerated.qrCode, seeded.tenant.id);
  assert(stillActive?.status === 'active', 'new qr active');

  const siteQr = await issueSiteQr(admin, siteA.id);
  assert(siteQr.assetType === 'site', 'site type');
  assert(siteQr.targetId === siteA.id, 'site target');

  await expectFailure(
    () =>
      insertQrAsset({
        tenantId: seeded.tenant.id,
        siteId: siteA.id,
        assetType: 'employee',
        targetType: 'employee',
        targetId: createId(),
        qrCode: regenerated.qrCode,
        displayName: 'dup',
        createdBy: admin.userId,
        deviceId: admin.deviceId,
      }),
    'UNIQUE',
    'qr_code unique',
  );

  resetQrScanCooldown();
  const valid = await scanQr(admin, regenerated.qrCode, { skipCooldown: true });
  assert(valid.scanResult === 'valid', 'valid scan');
  assert(valid.employee?.fullName === '林守成', 'employee name');
  assert(valid.employee?.employeeNo === 'E-lin.qr', 'employee no');

  const inactiveScan = await scanQr(admin, employeeQr.qrCode, { skipCooldown: true });
  assert(inactiveScan.scanResult === 'inactive', 'inactive scan');
  assert(inactiveScan.message.includes('已停用'), 'inactive message');
  assert(inactiveScan.employee == null, 'inactive must not leak profile');

  const garbage = await scanQr(admin, '%%%not-a-qr%%%', { skipCooldown: true });
  assert(garbage.scanResult === 'invalid', 'garbage invalid');

  const foreign = await scanQr(admin, 'https://example.com/login?token=abc', { skipCooldown: true });
  assert(foreign.scanResult === 'invalid', 'foreign qr invalid');
  assert(foreign.message.includes('不是勤管系統'), 'foreign message');

  const other = await seed('他司', 'other.qr.admin', '他司案場');
  const otherActor = asActor(other.user);
  const otherUser = await createUser(otherActor, other.tenant, {
    fullName: '他司人員',
    account: 'other.guard',
    siteId: (await db.getFirst<{ id: string }>(`SELECT id FROM sites WHERE tenant_id = ?`, [other.tenant.id]))!.id,
    roleKey: 'STAFF',
  });
  const otherQr = await issueEmployeeQr(otherActor, otherUser.id);
  const cross = await scanQr(admin, otherQr.qrCode, { skipCooldown: true });
  assert(cross.scanResult === 'cross_tenant', 'cross tenant');
  assert(cross.message === '此 QR 不屬於目前公司', 'cross message');
  assert(cross.employee == null, 'no leak name');
  assert(cross.site == null, 'no leak site');
  assert(cross.asset == null, 'no leak asset');

  const unauthorized = await scanQr(managerActor, regenerated.qrCode, { skipCooldown: true });
  assert(unauthorized.scanResult === 'unauthorized', 'unauthorized manager');
  assert(unauthorized.message.includes('沒有權限查看此人員'), 'unauthorized message');
  assert(unauthorized.employee == null, 'unauthorized no profile');

  const today = new Date();
  const workDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const schedule = await createSchedule(admin, {
    userId: guard.id,
    siteId: siteA.id,
    workDate,
    shiftTemplateId: day.id,
  });
  setMockLocationResult({ ok: true, fix: { latitude: 25.033, longitude: 121.565 } });
  await clockIn(staffActor, { siteId: siteA.id, scheduleId: schedule.id, at: today.toISOString() });
  await startWorkSession(staffActor, { siteId: siteA.id, scheduleId: schedule.id, at: today.toISOString() });
  const live = await scanQr(admin, regenerated.qrCode, { skipCooldown: true, at: today });
  assert(live.employee?.clockedIn, 'real clock in');
  assert(live.employee?.onDuty, 'real work session');
  assert(live.employee?.todayShiftName === '日班', `shift ${live.employee?.todayShiftName}`);
  assert(live.employee?.currentSiteName === '中正名人巷', 'current site');
  assert(live.employee?.dutyStatus === 'on_duty', 'duty status');

  resetQrScanCooldown();
  const beforeCount = (await listQrScanLogs(seeded.tenant.id)).length;
  const t0 = new Date('2026-12-01T10:00:00.000Z');
  await scanQr(admin, siteQr.qrCode, { at: t0 });
  await scanQr(admin, siteQr.qrCode, { at: new Date(t0.getTime() + 400) });
  const afterCount = (await listQrScanLogs(seeded.tenant.id)).length;
  assert(afterCount === beforeCount + 1, `debounce should add one log, got ${afterCount - beforeCount}`);

  await expectFailure(
    () => deactivateQrAssetByActor(staffActor, regenerated.id, 'QR 外洩'),
    '權限',
    'staff cannot deactivate',
  );
  const stopped = await deactivateQrAssetByActor(admin, regenerated.id, 'QR 外洩');
  assert(stopped.status === 'inactive', 'deactivated');
  await expectFailure(() => reactivateQrAssetByActor(staffActor, regenerated.id), '權限', 'staff cannot reactivate');
  const again = await reactivateQrAssetByActor(admin, regenerated.id);
  assert(again.status === 'active', 'reactivated');

  const png = await exportQrPng(admin, siteQr.id);
  assert(png.dataUrl.startsWith('data:image/png'), 'png export');

  const logs = await listAuditLogs(seeded.tenant.id);
  const createLog = logs.find((item) => item.description.includes('建立「林守成」的人員 QR'));
  assert(createLog, 'create audit');
  assert(createLog.actorNameSnapshot === admin.fullName, 'audit real name');
  assert(formatDateTimeZh(createLog.createdAt).includes('年'), 'audit zh time');
  assert(logs.some((item) => item.description.includes('重新產生')), 'regenerate audit');
  assert(logs.some((item) => item.description.includes('停用「林守成」')), 'deactivate audit');
  assert(logs.some((item) => item.description.includes('重新啟用「林守成」')), 'reactivate audit');
  assert(logs.some((item) => item.description.includes('匯出')), 'export audit');

  db.close();
  const reopened = createBetterSqliteDatabase(db.filename);
  setDatabase(reopened);
  await migrate(reopened);
  assert((await getSchemaVersion(reopened)) === CURRENT_SCHEMA_VERSION, 'reopen version');
  assert(await getQrAssetByCode(regenerated.qrCode, seeded.tenant.id), 'qr persisted');
  reopened.close();
  fs.unlinkSync(db.filename);

  const upgradeFile = path.join(os.tmpdir(), `qinguan-p2b1-up-${createId()}.db`);
  const up = createBetterSqliteDatabase(upgradeFile);
  setDatabase(up);
  configureKvStore(new MemoryKvStore());
  await applyThrough004(up);
  assert((await getSchemaVersion(up)) === 4, 'setup schema 4');
  const before = await seed('升級二B', 'up2b1.admin');
  const admin2 = asActor(before.user);
  const siteRow = await up.getFirst<{ id: string }>(`SELECT id FROM sites WHERE tenant_id = ?`, [before.tenant.id]);
  assert(siteRow, 'upgrade site');
  const shift = await createShiftTemplate(admin2, { name: '日班', code: 'DAY-UP', startTime: '08:00', endTime: '20:00' });
  const upGuard = await createUser(admin2, before.tenant, {
    fullName: '升級人員',
    account: 'up.qr.guard',
    siteId: siteRow.id,
    roleKey: 'STAFF',
  });
  const kept = await createSchedule(admin2, {
    userId: upGuard.id,
    siteId: siteRow.id,
    workDate: '2026-12-01',
    shiftTemplateId: shift.id,
  });
  const logsBefore = await listAuditLogs(before.tenant.id);
  const afterV = await migrate(up);
  assert(afterV === CURRENT_SCHEMA_VERSION, 'upgrade 004 → 005');
  assert(await getWorkScheduleById(kept.id, before.tenant.id), 'kept phase 2A schedule');
  assert((await listAuditLogs(before.tenant.id)).length === logsBefore.length, 'kept audit');
  const qrTables = await up.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE name IN ('qr_assets', 'qr_scan_logs')`,
  );
  assert(qrTables.length === 2, '005 tables after upgrade');
  up.close();
  fs.unlinkSync(upgradeFile);

  console.log('Phase 2B-1 tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
