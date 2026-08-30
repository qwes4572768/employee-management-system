import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { migration002 } from '@/database/migrations/002_integrity_constraints';
import { migration003 } from '@/database/migrations/003_workforce_attendance';
import { migration004 } from '@/database/migrations/004_site_shift_requirements';
import { migration005 } from '@/database/migrations/005_qr_asset_center';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { listNotifications } from '@/repositories/notificationRepository';
import { getQrAssetByCode } from '@/repositories/qrAssetRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import { getWorkScheduleById } from '@/repositories/workforceRepository';
import { listPatrolTaskPoints } from '@/repositories/patrolTaskRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { assignRoleToUser } from '@/services/roleService';
import { assignUserToSite, createSite } from '@/services/siteService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { createSchedule, createShiftTemplate } from '@/services/scheduleService';
import { startWorkSession, endWorkSession } from '@/services/workSessionService';
import { setMockLocationResult, resetLocationProvider } from '@/services/locationProvider';
import { createPatrolPoint } from '@/services/patrolPointService';
import { addPatrolTemplatePoint, createPatrolTemplate, updatePatrolTemplateByActor } from '@/services/patrolTemplateService';
import { generatePatrolTasksForSession, getPatrolTaskDetail, listOwnPatrolTasks, refreshPatrolTask } from '@/services/patrolTaskService';
import { completePatrolPoint } from '@/services/patrolCheckService';
import { createPatrolException } from '@/services/patrolExceptionService';
import { getPatrolSiteDashboard } from '@/services/patrolDashboardService';
import { issuePatrolPointQr } from '@/services/qrAssetService';
import { formatDateTimeZh } from '@/utils/datetime';
import { createId } from '@/utils/id';
import { combineDateAndTime } from '@/utils/scheduleTime';
import { resolvePatrolWindow } from '@/utils/patrolWindow';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p2b2'): ActorContext {
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
  const filename = path.join(os.tmpdir(), `qinguan-p2b2-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  resetLocationProvider();
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

async function applyThrough005(db: ReturnType<typeof createBetterSqliteDatabase>) {
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
  await applyMigration(db, 5, '005_qr_asset_center', migration005.up);
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'patrol_points','patrol_templates','patrol_template_points','patrol_tasks',
      'patrol_task_points','patrol_check_records','patrol_evidence','patrol_exceptions'
    )`,
  );
  assert(tables.length === 8, `patrol tables missing ${tables.length}`);

  const overnight = resolvePatrolWindow({
    shiftStart: combineDateAndTime('2026-12-01', '20:00'),
    shiftEnd: combineDateAndTime('2026-12-02', '08:00'),
    windowStartTime: '23:30',
    windowEndTime: '00:30',
  });
  assert(overnight.end.getTime() - overnight.start.getTime() === 60 * 60 * 1000, 'overnight 23:30-00:30 is 60min');
  assert(overnight.start.getHours() === 23 && overnight.start.getMinutes() === 30, 'start 23:30');
  assert(overnight.end.getHours() === 0 && overnight.end.getMinutes() === 30, 'end 00:30');
  const early = resolvePatrolWindow({
    shiftStart: combineDateAndTime('2026-12-01', '20:00'),
    shiftEnd: combineDateAndTime('2026-12-02', '08:00'),
    windowStartTime: '02:00',
    windowEndTime: '03:00',
  });
  assert(early.start.getHours() === 2, '02:00 after midnight');
  assert(early.start.getTime() > overnight.start.getTime(), '02:00 is after 23:30');

  const seeded = await seed('勤巡', 'p2b2.admin');
  const admin = asActor(seeded.user);
  const siteA = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-A',
    name: '中正名人巷',
    address: '台北市',
  });
  const siteB = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-B',
    name: '信義遠眺',
    address: '台北市',
  });
  const night = await createShiftTemplate(admin, {
    name: '夜班',
    code: 'NIGHT',
    startTime: '20:00',
    endTime: '08:00',
  });
  const guard = await createUser(admin, seeded.tenant, {
    fullName: '林守成',
    account: 'lin.patrol',
    siteId: siteA.id,
    roleKey: 'STAFF',
  });
  const scopedManager = await createUser(admin, seeded.tenant, {
    fullName: '黃主管',
    account: 'huang.patrol',
    siteId: siteB.id,
    roleKey: 'MANAGER',
  });
  const staffActor = asActor(guard, siteA.id, '一般勤務人員');
  const managerB = asActor(scopedManager, siteB.id, '主管');

  const gate = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '大門',
    code: 'PP-GATE',
    requireQr: true,
    requireGps: false,
    requirePhoto: false,
  });
  assert(gate.name === '大門', 'create point');
  await expectFailure(
    () => createPatrolPoint(staffActor, { siteId: siteA.id, name: '不該建', code: 'NO' }),
    '權限',
    'staff cannot create point',
  );

  const gateQr = await issuePatrolPointQr(admin, gate.id);
  assert(gateQr.targetType === 'patrol_point', 'patrol qr type');
  assert(gateQr.targetId === gate.id, 'patrol qr target');
  assert(gateQr.status === 'active', 'patrol qr active');

  const basement = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '地下室',
    code: 'PP-BASE',
    requireQr: true,
    requireGps: false,
  });
  const fire = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '消防機房',
    code: 'PP-FIRE',
    latitude: 25.033,
    longitude: 121.565,
    gpsRadiusMeters: 30,
    requireQr: false,
    requireGps: true,
    requirePhoto: false,
  });
  const roof = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '頂樓',
    code: 'PP-ROOF',
    requireQr: false,
    requireGps: false,
    requirePhoto: true,
  });
  const noGps = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '瓦斯間',
    code: 'PP-GAS',
    requireQr: false,
    requireGps: true,
    requirePhoto: false,
  });
  const extra = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '後門',
    code: 'PP-BACK',
    requireQr: false,
    requireGps: false,
  });

  const template = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '夜班第一輪',
    description: '22:00–00:00',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
    allowLatePatrol: true,
    enforceSequence: false,
  });
  await addPatrolTemplatePoint(admin, {
    templateId: template.id,
    patrolPointId: gate.id,
    sequenceNo: 1,
    windowStartTime: '22:00',
    windowEndTime: '22:30',
    graceMinutes: 0,
  });
  await addPatrolTemplatePoint(admin, {
    templateId: template.id,
    patrolPointId: basement.id,
    sequenceNo: 2,
    windowStartTime: '22:00',
    windowEndTime: '22:30',
  });
  await addPatrolTemplatePoint(admin, {
    templateId: template.id,
    patrolPointId: fire.id,
    sequenceNo: 3,
    windowStartTime: '22:00',
    windowEndTime: '22:30',
  });
  await addPatrolTemplatePoint(admin, {
    templateId: template.id,
    patrolPointId: extra.id,
    sequenceNo: 4,
    windowStartTime: '22:00',
    windowEndTime: '22:30',
    isCritical: true,
  });

  const workDate = '2026-12-01';
  const schedule = await createSchedule(admin, {
    userId: guard.id,
    siteId: siteA.id,
    workDate,
    shiftTemplateId: night.id,
  });
  const sessionAt = combineDateAndTime(workDate, '20:05');
  await expectFailure(
    () =>
      completePatrolPoint(staffActor, 'missing', { at: sessionAt }),
    '找不到',
    'no task yet',
  );

  const session = await startWorkSession(staffActor, {
    siteId: siteA.id,
    scheduleId: schedule.id,
    at: sessionAt.toISOString(),
  });
  const tasks = await listOwnPatrolTasks(staffActor);
  assert(tasks.length === 1, `generated task count ${tasks.length}`);
  const again = await generatePatrolTasksForSession(staffActor, session, sessionAt);
  assert(again.length === 0 || (await listOwnPatrolTasks(staffActor)).length === 1, 'no duplicate task');
  const second = await generatePatrolTasksForSession(staffActor, session, sessionAt);
  assert(second.length === 0, 'service duplicate blocked');
  assert((await listOwnPatrolTasks(staffActor)).length === 1, 'still one task');

  const task = (await listOwnPatrolTasks(staffActor))[0];
  assert(task, 'task exists');
  let points = await listPatrolTaskPoints(seeded.tenant.id, task.id);
  assert(points.length === 4, 'snapshot points');
  const firstSnap = points[0];
  assert(firstSnap, 'first snapshot');
  const originalWindow = firstSnap.windowStartAt;
  await addPatrolTemplatePoint(admin, {
    templateId: template.id,
    patrolPointId: roof.id,
    sequenceNo: 9,
    windowStartTime: '03:00',
    windowEndTime: '03:30',
  });
  await updatePatrolTemplateByActor(admin, template.id, { name: '夜班第一輪-已改' });
  points = await listPatrolTaskPoints(seeded.tenant.id, task.id);
  assert(points.length === 4, 'snapshot not affected by later template add');
  const firstSnapAfter = points[0];
  assert(firstSnapAfter, 'first snapshot after');
  assert(firstSnapAfter.windowStartAt === originalWindow, 'window snapshot kept');
  assert(task.templateNameSnapshot === '夜班第一輪', 'name snapshot kept');

  await endWorkSession(staffActor, { sessionId: session.id, at: combineDateAndTime(workDate, '20:10').toISOString() });
  await expectFailure(
    () => completePatrolPoint(staffActor, firstSnapAfter.id, { qrCode: gateQr.qrCode, at: combineDateAndTime(workDate, '22:10') }),
    '請先開始勤務',
    'cannot patrol without session',
  );

  const session2 = await startWorkSession(staffActor, {
    siteId: siteA.id,
    scheduleId: schedule.id,
    at: combineDateAndTime(workDate, '20:15').toISOString(),
  });
  assert((await listOwnPatrolTasks(staffActor)).length === 1, 'same schedule does not create second task');
  const liveTask = (await listOwnPatrolTasks(staffActor))[0];
  assert(liveTask, 'live task');
  assert(liveTask.workSessionId === session2.id, 'task rebound to new session');
  points = await listPatrolTaskPoints(seeded.tenant.id, liveTask.id);

  const inWindow = combineDateAndTime(workDate, '22:10');
  const gatePoint = points.find((item) => item.patrolPointId === gate.id);
  const basePoint = points.find((item) => item.patrolPointId === basement.id);
  const firePoint = points.find((item) => item.patrolPointId === fire.id);
  const extraPoint = points.find((item) => item.patrolPointId === extra.id);
  assert(gatePoint && basePoint && firePoint && extraPoint, 'core points');

  const ok = await completePatrolPoint(staffActor, gatePoint.id, { qrCode: gateQr.qrCode, at: inWindow });
  assert(ok.check.result === 'success', 'correct qr success');

  const basementQr = await issuePatrolPointQr(admin, basement.id);
  await expectFailure(
    () => completePatrolPoint(staffActor, gatePoint.id, { qrCode: basementQr.qrCode, at: inWindow }),
    '已於',
    'cannot complete twice',
  );
  await expectFailure(
    () => completePatrolPoint(staffActor, basePoint.id, { qrCode: gateQr.qrCode, at: inWindow }),
    '不符',
    'wrong point qr',
  );
  const baseOk = await completePatrolPoint(staffActor, basePoint.id, { qrCode: basementQr.qrCode, at: inWindow });
  assert(baseOk.check.result === 'success', 'basement success');

  setMockLocationResult({ ok: true, fix: { latitude: 25.033, longitude: 121.565, accuracy: 8, mocked: false } });
  const gpsOk = await completePatrolPoint(staffActor, firePoint.id, { at: inWindow });
  assert(gpsOk.check.result === 'success', 'gps in range');
  assert(gpsOk.check.distanceMeters != null && gpsOk.check.distanceMeters <= 30, 'distance recorded');

  const seqTemplate = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '順序測試',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
    enforceSequence: true,
    allowLatePatrol: false,
  });
  const seqA = await createPatrolPoint(admin, { siteId: siteA.id, name: '順序A', code: 'SEQ-A', requireQr: false });
  const seqB = await createPatrolPoint(admin, { siteId: siteA.id, name: '順序B', code: 'SEQ-B', requireQr: false });
  await addPatrolTemplatePoint(admin, {
    templateId: seqTemplate.id,
    patrolPointId: seqA.id,
    sequenceNo: 1,
    windowStartTime: '22:00',
    windowEndTime: '23:00',
  });
  await addPatrolTemplatePoint(admin, {
    templateId: seqTemplate.id,
    patrolPointId: seqB.id,
    sequenceNo: 2,
    windowStartTime: '22:00',
    windowEndTime: '23:00',
  });
  const seqTasks = await generatePatrolTasksForSession(staffActor, session2, inWindow);
  const seqTask = seqTasks.find((item) => item.templateNameSnapshot === '順序測試');
  assert(seqTask, 'sequence task');
  const seqPoints = await listPatrolTaskPoints(seeded.tenant.id, seqTask.id);
  const secondSeq = seqPoints.find((item) => item.patrolPointId === seqB.id)!;
  await expectFailure(
    () => completePatrolPoint(staffActor, secondSeq.id, { at: inWindow }),
    '請先完成上一巡邏點',
    'enforce sequence',
  );

  const photoPoint = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '需拍照',
    code: 'PP-PHOTO',
    requireQr: false,
    requirePhoto: true,
  });
  const photoTpl = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '拍照輪',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
  });
  await addPatrolTemplatePoint(admin, {
    templateId: photoTpl.id,
    patrolPointId: photoPoint.id,
    sequenceNo: 1,
    windowStartTime: '22:00',
    windowEndTime: '23:00',
  });
  const photoTasks = await generatePatrolTasksForSession(staffActor, session2, inWindow);
  const photoTask = photoTasks.find((item) => item.templateNameSnapshot === '拍照輪')!;
  const photoTp = (await listPatrolTaskPoints(seeded.tenant.id, photoTask.id))[0];
  assert(photoTp, 'photo point');
  await expectFailure(() => completePatrolPoint(staffActor, photoTp.id, { at: inWindow }), '現場照片', 'photo required');
  const photoOk = await completePatrolPoint(staffActor, photoTp.id, {
    at: inWindow,
    photoLocalUri: 'file:///tmp/patrol-original.jpg',
  });
  assert(photoOk.evidence?.localUri === 'file:///tmp/patrol-original.jpg', 'original kept');

  setMockLocationResult({ ok: true, fix: { latitude: 25.0342, longitude: 121.565, accuracy: 5 } });
  const gpsTpl = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: 'GPS外',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
  });
  await addPatrolTemplatePoint(admin, {
    templateId: gpsTpl.id,
    patrolPointId: fire.id,
    sequenceNo: 1,
    windowStartTime: '22:00',
    windowEndTime: '23:00',
  });
  const gpsTasks = await generatePatrolTasksForSession(staffActor, session2, inWindow);
  const gpsTask = gpsTasks.find((item) => item.templateNameSnapshot === 'GPS外')!;
  const gpsTp = (await listPatrolTaskPoints(seeded.tenant.id, gpsTask.id))[0];
  assert(gpsTp, 'gps point');
  await expectFailure(() => completePatrolPoint(staffActor, gpsTp.id, { at: inWindow }), '允許範圍', 'gps out of range');

  const cfgTpl = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '缺座標',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
  });
  await addPatrolTemplatePoint(admin, {
    templateId: cfgTpl.id,
    patrolPointId: noGps.id,
    sequenceNo: 1,
    windowStartTime: '22:00',
    windowEndTime: '23:00',
  });
  const cfgTasks = await generatePatrolTasksForSession(staffActor, session2, inWindow);
  const cfgTask = cfgTasks.find((item) => item.templateNameSnapshot === '缺座標')!;
  const cfgTp = (await listPatrolTaskPoints(seeded.tenant.id, cfgTask.id))[0];
  assert(cfgTp, 'cfg point');
  await expectFailure(
    () => completePatrolPoint(staffActor, cfgTp.id, { at: inWindow }),
    '尚未設定 GPS',
    'missing gps config',
  );

  const lateAt = combineDateAndTime(workDate, '22:40');
  await refreshPatrolTask(seeded.tenant.id, liveTask.id, lateAt);
  const lateOk = await completePatrolPoint(staffActor, extraPoint.id, { at: lateAt });
  assert(lateOk.check.result === 'late_success', 'late success');
  const afterLate = await getPatrolTaskDetail(admin, liveTask.id, lateAt);
  assert(afterLate.points.find((item) => item.id === extraPoint.id)?.missedAt, 'missed history kept');
  assert(afterLate.stats.onTime === 3, `on time ${afterLate.stats.onTime}`);
  assert(afterLate.stats.late === 1, `late ${afterLate.stats.late}`);
  assert(afterLate.stats.completed === 4, 'all four completed after late');

  const missTpl = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '漏巡輪',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
    allowLatePatrol: false,
  });
  const crit = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '重點機房',
    code: 'PP-CRIT',
    requireQr: false,
  });
  await addPatrolTemplatePoint(admin, {
    templateId: missTpl.id,
    patrolPointId: crit.id,
    sequenceNo: 1,
    windowStartTime: '22:00',
    windowEndTime: '22:10',
    graceMinutes: 0,
    isCritical: true,
  });
  const missTasks = await generatePatrolTasksForSession(staffActor, session2, inWindow);
  const missTask = missTasks.find((item) => item.templateNameSnapshot === '漏巡輪')!;
  const missedAt = combineDateAndTime(workDate, '22:20');
  const missed = await refreshPatrolTask(seeded.tenant.id, missTask.id, missedAt);
  assert(missed.stats.missed === 1, 'missed counted');
  assert(missed.stats.criticalMissed === 1, 'critical missed');
  assert(missed.stats.completionRate === 0, 'rate 0');
  const dash = await getPatrolSiteDashboard(admin, siteA.id, missedAt);
  assert(dash.criticalMissed >= 1, 'dashboard critical');
  assert(dash.criticalWarning, 'critical warning');

  const rateTpl = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '完成率輪',
    shiftTemplateId: night.id,
    effectiveStartDate: '2026-01-01',
    allowLatePatrol: true,
  });
  const p1 = await createPatrolPoint(admin, { siteId: siteA.id, name: 'R1', code: 'R1', requireQr: false });
  const p2 = await createPatrolPoint(admin, { siteId: siteA.id, name: 'R2', code: 'R2', requireQr: false });
  const p3 = await createPatrolPoint(admin, { siteId: siteA.id, name: 'R3', code: 'R3', requireQr: false });
  const p4 = await createPatrolPoint(admin, { siteId: siteA.id, name: 'R4', code: 'R4', requireQr: false });
  for (const [point, seq] of [
    [p1, 1],
    [p2, 2],
    [p3, 3],
    [p4, 4],
  ] as const) {
    await addPatrolTemplatePoint(admin, {
      templateId: rateTpl.id,
      patrolPointId: point.id,
      sequenceNo: seq,
      windowStartTime: '22:00',
      windowEndTime: '22:15',
      graceMinutes: 0,
    });
  }
  const rateTasks = await generatePatrolTasksForSession(staffActor, session2, inWindow);
  const rateTask = rateTasks.find((item) => item.templateNameSnapshot === '完成率輪')!;
  const ratePoints = await listPatrolTaskPoints(seeded.tenant.id, rateTask.id);
  const rate0 = ratePoints[0];
  const rate1 = ratePoints[1];
  const rate2 = ratePoints[2];
  const rate3 = ratePoints[3];
  assert(rate0 && rate1 && rate2 && rate3, 'rate points');
  const t2210 = combineDateAndTime(workDate, '22:10');
  await completePatrolPoint(staffActor, rate0.id, { at: t2210 });
  await completePatrolPoint(staffActor, rate1.id, { at: t2210 });
  const t2230 = combineDateAndTime(workDate, '22:30');
  await refreshPatrolTask(seeded.tenant.id, rateTask.id, t2230);
  await completePatrolPoint(staffActor, rate2.id, { at: t2230 });
  const rate = await refreshPatrolTask(seeded.tenant.id, rateTask.id, t2230);
  assert(rate.stats.onTime === 2, `rate ontime ${rate.stats.onTime}`);
  assert(rate.stats.late === 1, `rate late ${rate.stats.late}`);
  assert(rate.stats.missed === 1, `rate missed ${rate.stats.missed}`);
  assert(rate.stats.completed === 3, '7/8 style completed 3/4');
  assert(rate.stats.completionRate === 75, `rate ${rate.stats.completionRate}`);

  const exception = await createPatrolException(staffActor, {
    taskId: liveTask.id,
    taskPointId: gatePoint.id,
    category: 'fire',
    severity: 'urgent',
    description: '消防箱門未關',
  });
  assert(exception.sourceModule === 'patrol', 'source module');
  const notes = await listNotifications(seeded.tenant.id, admin.userId!);
  assert(notes.some((item) => item.title.includes('重大異常')), 'urgent notification');

  await expectFailure(
    () =>
      completePatrolPoint(staffActor, rate3.id, {
        at: t2230,
        manualOverride: { reason: 'phone_failure', description: '手機沒電' },
      }),
    '權限',
    'staff cannot override',
  );
  const override = await completePatrolPoint(admin, rate3.id, {
    at: t2230,
    manualOverride: { reason: 'phone_failure', description: '現場手機故障，改由主管補登' },
  });
  assert(override.check.result === 'manual_override', 'override tagged');

  const other = await seed('他司巡', 'other.patrol.admin');
  const otherActor = asActor(other.user);
  const otherSiteId = (await db.getFirst<{ id: string }>(`SELECT id FROM sites WHERE tenant_id = ?`, [other.tenant.id]))!.id;
  const otherPoint = await createPatrolPoint(otherActor, { siteId: otherSiteId, name: '他司點', code: 'OTHER' });
  await expectFailure(() => createPatrolPoint(admin, { siteId: otherSiteId, name: '入侵', code: 'X' }), '其他公司', 'cross tenant create');
  await expectFailure(
    async () => {
      const { getPatrolPointForActor } = await import('@/services/patrolPointService');
      await getPatrolPointForActor(admin, otherPoint.id);
    },
    '其他公司',
    'cross tenant view',
  );

  await expectFailure(() => getPatrolSiteDashboard(managerB, siteA.id), '沒有權限查看此案場', 'site scope');

  const logs = await listAuditLogs(seeded.tenant.id);
  const createLog = logs.find((item) => item.description.includes('建立巡邏點「大門」'));
  assert(createLog, 'create point audit');
  assert(createLog.actorNameSnapshot === admin.fullName, 'audit real name');
  assert(formatDateTimeZh(createLog.createdAt).includes('年'), 'audit zh time');
  assert(logs.some((item) => item.description.includes('生成巡邏任務')), 'generate audit');
  assert(logs.some((item) => item.description.includes('完成巡邏點')), 'complete audit');
  assert(logs.some((item) => item.description.includes('逾時補巡')), 'late audit');
  assert(logs.some((item) => item.description.includes('補登巡邏點')), 'override audit');

  db.close();
  const reopened = createBetterSqliteDatabase(db.filename);
  setDatabase(reopened);
  await migrate(reopened);
  assert((await getSchemaVersion(reopened)) === CURRENT_SCHEMA_VERSION, 'reopen version');
  assert(await getQrAssetByCode(gateQr.qrCode, seeded.tenant.id), 'qr persisted');
  assert((await listPatrolTaskPoints(seeded.tenant.id, liveTask.id)).length >= 4, 'tasks persisted');
  reopened.close();
  fs.unlinkSync(db.filename);

  const upgradeFile = path.join(os.tmpdir(), `qinguan-p2b2-up-${createId()}.db`);
  const up = createBetterSqliteDatabase(upgradeFile);
  setDatabase(up);
  configureKvStore(new MemoryKvStore());
  await applyThrough005(up);
  assert((await getSchemaVersion(up)) === 5, 'setup schema 5');
  const before = await seed('升級二B2', 'up2b2.admin');
  const admin2 = asActor(before.user);
  const siteRow = await up.getFirst<{ id: string }>(`SELECT id FROM sites WHERE tenant_id = ?`, [before.tenant.id]);
  assert(siteRow, 'upgrade site');
  const shift = await createShiftTemplate(admin2, { name: '日班', code: 'DAY-UP', startTime: '08:00', endTime: '20:00' });
  const upGuard = await createUser(admin2, before.tenant, {
    fullName: '升級人員',
    account: 'up.patrol.guard',
    siteId: siteRow.id,
    roleKey: 'STAFF',
  });
  const kept = await createSchedule(admin2, {
    userId: upGuard.id,
    siteId: siteRow.id,
    workDate: '2026-12-01',
    shiftTemplateId: shift.id,
  });
  const qrKept = await issuePatrolPointQr;
  void qrKept;
  const { issueEmployeeQr } = await import('@/services/qrAssetService');
  const empQr = await issueEmployeeQr(admin2, upGuard.id);
  const logsBefore = await listAuditLogs(before.tenant.id);
  const afterV = await migrate(up);
  assert(afterV === CURRENT_SCHEMA_VERSION, 'upgrade 005 → 006');
  assert(await getWorkScheduleById(kept.id, before.tenant.id), 'kept phase 2A schedule');
  assert(await getQrAssetByCode(empQr.qrCode, before.tenant.id), 'kept qr');
  assert((await listAuditLogs(before.tenant.id)).length === logsBefore.length, 'kept audit');
  const patrolTables = await up.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE name IN ('patrol_points', 'patrol_tasks')`,
  );
  assert(patrolTables.length === 2, '006 tables after upgrade');
  up.close();
  fs.unlinkSync(upgradeFile);

  console.log('Phase 2B-2 tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
