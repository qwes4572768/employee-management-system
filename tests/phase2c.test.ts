import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { migration002 } from '@/database/migrations/002_integrity_constraints';
import { migration003 } from '@/database/migrations/003_workforce_attendance';
import { migration004 } from '@/database/migrations/004_site_shift_requirements';
import { migration005 } from '@/database/migrations/005_qr_asset_center';
import { migration006 } from '@/database/migrations/006_smart_patrol';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { getInspectionEvaluationById, listEvaluationItems } from '@/repositories/inspectionEvaluationRepository';
import { getInspectionSessionById } from '@/repositories/inspectionSessionRepository';
import { getDisciplinaryRecommendationById } from '@/repositories/disciplineRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { assignRoleToUser } from '@/services/roleService';
import { assignUserToSite, createSite, editSite } from '@/services/siteService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { createSchedule, createShiftTemplate } from '@/services/scheduleService';
import { clockIn } from '@/services/attendanceService';
import { startWorkSession } from '@/services/workSessionService';
import { setMockLocationResult, resetLocationProvider } from '@/services/locationProvider';
import { issueEmployeeQr } from '@/services/qrAssetService';
import { createPatrolPoint } from '@/services/patrolPointService';
import { addPatrolTemplatePoint, createPatrolTemplate } from '@/services/patrolTemplateService';
import { generatePatrolTasksForSession, refreshPatrolTask } from '@/services/patrolTaskService';
import { listPatrolTasks } from '@/repositories/patrolTaskRepository';
import {
  getInspectionContext,
  requireReinspection,
  saveInspectionEvaluation,
  startInspectionFromQr,
  startReinspectionFromQr,
  voidInspection,
} from '@/services/inspectionService';
import {
  listInspectionCriteriaForActor,
  updateInspectionCriteriaForActor,
} from '@/services/inspectionCatalogService';
import { addInspectionEvidence } from '@/services/inspectionService';
import {
  createImprovementOrder,
  getImprovementDetail,
  reviewImprovement,
  submitImprovementReply,
} from '@/services/improvementService';
import { recommendDiscipline, reviewDiscipline } from '@/services/disciplineService';
import { getInspectionHomeCard, getInspectionSiteDashboard, inspectionHasPayrollDeduction } from '@/services/inspectionDashboardService';
import { getDashboardSnapshot } from '@/services/dashboardService';
import { computeWeightedScore, resolveInspectionGrade } from '@/utils/inspectionScore';
import { formatDateTimeZh, toDateOnly } from '@/utils/datetime';
import { createId } from '@/utils/id';
import { combineDateAndTime } from '@/utils/scheduleTime';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p2c'): ActorContext {
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
  const filename = path.join(os.tmpdir(), `qinguan-p2c-${createId()}.db`);
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

async function applyThrough006(db: ReturnType<typeof createBetterSqliteDatabase>) {
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
  await applyMigration(db, 6, '006_smart_patrol', migration006.up);
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(CURRENT_SCHEMA_VERSION === 7, 'schema version must be 7');
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'inspection_sessions','inspection_evaluations','inspection_criteria','inspection_evaluation_items',
      'inspection_evidence','improvement_orders','improvement_followups',
      'disciplinary_recommendations','disciplinary_reviews','inspection_policies'
    )`,
  );
  assert(tables.length === 10, `inspection tables missing ${tables.length}`);

  const seeded = await seed('勤督', 'p2c.admin');
  const admin = asActor(seeded.user);
  const siteA = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-A',
    name: '中正名人巷',
    address: '台北市',
    latitude: 25.033,
    longitude: 121.565,
    attendanceRadius: 80,
  });
  const siteB = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-B',
    name: '信義遠眺',
    address: '台北市',
  });
  const day = await createShiftTemplate(admin, {
    name: '日班',
    code: 'DAY',
    startTime: '08:00',
    endTime: '17:00',
  });
  const workDate = toDateOnly(new Date());
  const guard = await createUser(admin, seeded.tenant, {
    fullName: '陳守成',
    account: 'chen.inspect',
    siteId: siteA.id,
    roleKey: 'STAFF',
  });
  const inspector = await createUser(admin, seeded.tenant, {
    fullName: '林督勤',
    account: 'lin.inspect',
    siteId: siteA.id,
    roleKey: 'MANAGER',
  });
  const scopedManager = await createUser(admin, seeded.tenant, {
    fullName: '黃外場',
    account: 'huang.inspect',
    siteId: siteB.id,
    roleKey: 'MANAGER',
  });
  const staffActor = asActor(guard, siteA.id, '一般勤務人員');
  const inspectorActor = asActor(inspector, siteA.id, '主管');
  const managerB = asActor(scopedManager, siteB.id, '主管');

  const crit = await createPatrolPoint(admin, {
    siteId: siteA.id,
    name: '重點機房',
    code: 'PP-CRIT',
    requireQr: false,
  });
  const missTpl = await createPatrolTemplate(admin, {
    siteId: siteA.id,
    name: '漏巡輪',
    shiftTemplateId: day.id,
    effectiveStartDate: '2024-01-01',
    allowLatePatrol: false,
  });
  await addPatrolTemplatePoint(admin, {
    templateId: missTpl.id,
    patrolPointId: crit.id,
    sequenceNo: 1,
    windowStartTime: '08:00',
    windowEndTime: '08:10',
    graceMinutes: 0,
    isCritical: true,
  });
  const schedule = await createSchedule(admin, {
    userId: guard.id,
    siteId: siteA.id,
    workDate,
    shiftTemplateId: day.id,
    weeklyRestOverrideReason: '測試',
  });
  await clockIn(staffActor, {
    siteId: siteA.id,
    scheduleId: schedule.id,
    at: combineDateAndTime(workDate, '08:00').toISOString(),
  });
  const dutySession = await startWorkSession(staffActor, {
    siteId: siteA.id,
    scheduleId: schedule.id,
    at: combineDateAndTime(workDate, '08:05').toISOString(),
  });
  await generatePatrolTasksForSession(staffActor, dutySession, combineDateAndTime(workDate, '08:05'));
  const sessionAt = combineDateAndTime(workDate, '09:00');
  const tasks = await listPatrolTasks(seeded.tenant.id, { userId: guard.id, siteId: siteA.id, taskDate: workDate });
  assert(tasks[0], 'patrol task generated');
  await refreshPatrolTask(seeded.tenant.id, tasks[0].id, sessionAt);

  const employeeQr = await issueEmployeeQr(admin, guard.id);
  assert(employeeQr.qrCode.startsWith('QINGUAN:v1:'), 'employee qr payload');

  const started = await startInspectionFromQr(inspectorActor, employeeQr.qrCode, {
    at: sessionAt,
    siteId: siteA.id,
    skipCooldown: true,
  });
  assert(started.session.employeeUserId === guard.id, 'session employee');
  assert(started.session.inspectorUserId === inspector.id, 'session inspector');
  assert(started.session.qrScanLogId, 'linked qr_scan_log_id');
  assert(started.session.employeeQrAssetId === employeeQr.id, 'linked employee qr');
  assert(started.card.fullName === '陳守成', 'phase 2A name');
  assert(started.card.employeeNo === 'E-chen.inspect', 'employee no');
  assert(started.card.jobTitle === '保全員', 'job title');
  assert(started.card.todayShiftName === '日班', 'shift name');
  assert(started.card.clockInAt, 'clock in present');
  assert(started.card.onDuty, 'work session active');
  assert(started.card.patrol, 'patrol stats present');
  assert((started.card.patrol?.missed ?? 0) >= 1, 'missed patrol counted');
  assert((started.card.patrol?.criticalMissed ?? 0) >= 1, 'critical missed');
  const missCheck = started.verification.checks.find((item) => item.key === 'patrol_miss');
  assert(missCheck?.level === 'warning', 'missed patrol warning');
  const critCheck = started.verification.checks.find((item) => item.key === 'patrol_critical');
  assert(critCheck?.level === 'exception', 'critical patrol exception');
  assert(started.verification.checks.find((item) => item.key === 'schedule')?.level === 'normal', 'schedule ok');
  assert(started.verification.checks.find((item) => item.key === 'clock_in')?.level === 'normal', 'clock ok');
  assert(started.verification.checks.find((item) => item.key === 'work_session')?.level === 'normal', 'session ok');

  await expectFailure(
    () => startInspectionFromQr(staffActor, employeeQr.qrCode, { skipCooldown: true }),
    '權限',
    'staff cannot inspect',
  );

  const other = await seed('他司', 'p2c.other');
  const otherActor = asActor(other.user);
  const otherGuard = await createUser(otherActor, other.tenant, {
    fullName: '他司人員',
    account: 'other.guard',
    siteId: (await createSite(otherActor, { tenantId: other.tenant.id, siteCode: 'OX', name: '他司案場' })).id,
    roleKey: 'STAFF',
  });
  const otherQr = await issueEmployeeQr(otherActor, otherGuard.id);
  await expectFailure(
    () => startInspectionFromQr(inspectorActor, otherQr.qrCode, { skipCooldown: true }),
    '不屬於',
    'cross tenant rejected',
  );

  await expectFailure(
    () => startInspectionFromQr(managerB, employeeQr.qrCode, { siteId: siteB.id, skipCooldown: true }),
    'unauthorized',
    'unauthorized site rejected',
  );

  const catalog = await listInspectionCriteriaForActor(inspectorActor);
  assert(catalog.length === 12, `criteria catalog ${catalog.length}`);
  assert(catalog.some((item) => item.criteriaKey === 'appearance' && item.displayName === '服裝儀容'), 'stable key label');
  const sleeping = catalog.find((item) => item.criteriaKey === 'sleeping');
  assert(sleeping, 'sleeping criteria');
  const disabled = await updateInspectionCriteriaForActor(inspectorActor, sleeping.id, { status: 'inactive' });
  assert(disabled.status === 'inactive', 'criteria disabled');
  await updateInspectionCriteriaForActor(inspectorActor, sleeping.id, { status: 'active' });

  const ctx = await getInspectionContext(inspectorActor, started.session.id, sessionAt);
  assert(ctx.patrolHint?.includes('漏巡'), 'patrol hint');
  const drafts = ctx.criteria.map((item) => ({
    criteriaId: item.id,
    score: item.criteriaKey === 'sleeping' ? 1 : item.maxScore,
    comment: item.criteriaKey === 'patrol' ? ctx.patrolHint : null,
    isAbnormal: item.criteriaKey === 'sleeping',
    sourcePatrolTaskPointId: item.criteriaKey === 'patrol' ? (ctx.card.patrol ? undefined : null) : null,
  }));
  const scored = computeWeightedScore(
    ctx.criteria.map((item) => ({
      score: item.criteriaKey === 'sleeping' ? 1 : item.maxScore,
      maxScore: item.maxScore,
      weight: item.weight,
    })),
  );
  const saved = await saveInspectionEvaluation(inspectorActor, {
    sessionId: started.session.id,
    items: drafts,
    summary: '現場服裝尚可，睡覺為重大缺失',
    complete: true,
  });
  assert(saved.items.length === ctx.criteria.length, 'all item scores saved');
  assert(saved.evaluation.weightedScore === scored.weightedScore, `weighted ${saved.evaluation.weightedScore} vs ${scored.weightedScore}`);
  assert(saved.evaluation.majorDeficiency, 'major deficiency saved');
  const expectedGrade = resolveInspectionGrade(saved.evaluation.weightedScore, true, {
    excellentMinScore: 90,
    goodMinScore: 80,
    passMinScore: 70,
  });
  assert(saved.evaluation.grade === expectedGrade, `grade ${saved.evaluation.grade}`);
  const persistedItems = await listEvaluationItems(seeded.tenant.id, saved.evaluation.id);
  assert(persistedItems.every((item) => item.score != null), 'each score kept');

  const evidence = await addInspectionEvidence(inspectorActor, {
    sessionId: started.session.id,
    evaluationId: saved.evaluation.id,
    kind: 'deficiency',
    localUri: 'file:///tmp/inspection-original.jpg',
    liveCameraOnly: true,
  });
  assert(evidence.localUri === 'file:///tmp/inspection-original.jpg', 'original kept');

  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const order = await createImprovementOrder(inspectorActor, {
    evaluationId: saved.evaluation.id,
    title: '禁止值班睡覺',
    description: '請提出改善說明與照片',
    severity: 'urgent',
    dueAt: due,
  });
  const submitted = await submitImprovementReply(staffActor, { orderId: order.id, note: '已調整作息', photoUri: 'file:///tmp/fix.jpg' });
  assert(submitted.status === 'submitted', 'submitted');
  const rejected = await reviewImprovement(inspectorActor, { orderId: order.id, decision: 'reject', note: '說明不足' });
  assert(rejected.status === 'rejected', 'rejected');
  await submitImprovementReply(staffActor, { orderId: order.id, note: '補件：已輪替休息', photoUri: 'file:///tmp/fix2.jpg' });
  await reviewImprovement(inspectorActor, { orderId: order.id, decision: 'verify', note: '通過' });
  const closed = await reviewImprovement(inspectorActor, { orderId: order.id, decision: 'close', note: '結案' });
  assert(closed.status === 'closed', 'closed');
  const follow = await getImprovementDetail(inspectorActor, order.id);
  assert(follow.followups.length >= 5, `followups kept ${follow.followups.length}`);

  const reinspectedDue = await requireReinspection(inspectorActor, started.session.id, due);
  assert(reinspectedDue.reinspectionRequired, 'reinspect flagged');
  const second = await startReinspectionFromQr(inspectorActor, started.session.id, employeeQr.qrCode, {
    at: sessionAt,
    siteId: siteA.id,
  });
  assert(second.session.previousInspectionId === started.session.id, 'linked previous');
  assert(second.session.id !== started.session.id, 'new session');
  const original = await getInspectionSessionById(started.session.id, seeded.tenant.id);
  assert(original?.status === 'completed', 'original not mutated status beyond complete');

  const rec = await recommendDiscipline(inspectorActor, {
    evaluationId: saved.evaluation.id,
    siteId: siteA.id,
    employeeUserId: guard.id,
    actionKey: 'compensation_review',
    reason: '值班睡覺造成風險，建議賠償審核',
    compensationClaimAmount: 3000,
  });
  assert(rec.status === 'pending_review', 'pending review');
  assert(rec.compensationClaimAmount === 3000, 'claim amount only');
  await expectFailure(
    () => reviewDiscipline(inspectorActor, { recommendationId: rec.id, decision: 'approved', reviewNote: '自核' }),
    '自行核准',
    'recommender cannot self approve',
  );
  const approved = await reviewDiscipline(admin, { recommendationId: rec.id, decision: 'approved', reviewNote: '同意再訓練與賠償審核' });
  assert(approved.recommendation.status === 'approved', 'high permission approved');

  const rec2 = await recommendDiscipline(inspectorActor, {
    evaluationId: saved.evaluation.id,
    siteId: siteA.id,
    employeeUserId: guard.id,
    actionKey: 'verbal_warning',
    reason: '口頭警告建議',
  });
  const rejectedRec = await reviewDiscipline(admin, { recommendationId: rec2.id, decision: 'rejected', reviewNote: '證據不足' });
  assert(rejectedRec.recommendation.status === 'rejected', 'rejected kept');
  const stillThere = await getDisciplinaryRecommendationById(rec2.id, seeded.tenant.id);
  assert(stillThere, 'rejected recommendation retained');

  const recSelf = await recommendDiscipline(admin, {
    evaluationId: saved.evaluation.id,
    siteId: siteA.id,
    employeeUserId: guard.id,
    actionKey: 'written_warning',
    reason: '總管理員建議',
  });
  await expectFailure(
    () => reviewDiscipline(admin, { recommendationId: recSelf.id, decision: 'approved', reviewNote: '自核' }),
    '二次確認',
    'super admin needs confirm',
  );
  const selfOk = await reviewDiscipline(admin, {
    recommendationId: recSelf.id,
    decision: 'approved',
    reviewNote: '二次確認後核決',
    confirmSelfApprove: true,
  });
  assert(selfOk.recommendation.status === 'approved', 'super admin confirmed');

  assert(inspectionHasPayrollDeduction() === false, 'no payroll deduction helper');
  const payrollTables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%payroll%' OR name LIKE '%salary%' OR name LIKE '%wage%')`,
  );
  assert(payrollTables.length === 0, 'no payroll tables');
  const recCols = await db.getAll<{ name: string }>(`PRAGMA table_info(disciplinary_recommendations)`);
  assert(!recCols.some((col) => col.name === 'fine_amount'), 'no fine_amount');

  await expectFailure(
    () =>
      saveInspectionEvaluation(inspectorActor, {
        sessionId: started.session.id,
        items: drafts,
        complete: true,
      }),
    '覆寫',
    'cannot overwrite completed',
  );
  const revision = await saveInspectionEvaluation(inspectorActor, {
    sessionId: started.session.id,
    items: drafts.map((item) => ({ ...item, score: item.score })),
    summary: '更正評語',
    complete: true,
    revisesEvaluationId: saved.evaluation.id,
  });
  assert(revision.evaluation.revisesEvaluationId === saved.evaluation.id, 'revision linked');
  const originalEval = await getInspectionEvaluationById(saved.evaluation.id, seeded.tenant.id);
  assert(originalEval?.summary === '現場服裝尚可，睡覺為重大缺失', 'original kept');

  await expectFailure(() => voidInspection(staffActor, started.session.id, '無權'), '權限', 'void needs permission');
  await expectFailure(() => voidInspection(admin, started.session.id, ''), '原因', 'void needs reason');
  const voided = await voidInspection(admin, started.session.id, '評核對象認錯人');
  assert(voided.status === 'voided', 'voided');
  assert(voided.voidReason === '評核對象認錯人', 'reason kept');

  const logs = await listAuditLogs(seeded.tenant.id);
  const inspectLogs = logs.filter((item) => item.module === 'inspection' || item.module === 'discipline' || item.module === 'improvement');
  assert(inspectLogs.length >= 8, `audit count ${inspectLogs.length}`);
  assert(
    inspectLogs.every((item) => item.actorNameSnapshot && formatDateTimeZh(item.createdAt).includes('年')),
    'audit real name and time',
  );

  const home = await getInspectionHomeCard(staffActor);
  assert(home.openImprovements >= 0, 'home card');
  const dash = await getInspectionSiteDashboard(inspectorActor, siteA.id);
  assert(dash.todayCount >= 1, 'dashboard today');
  const snap = await getDashboardSnapshot(inspectorActor, { siteId: siteA.id });
  assert(snap.inspectionSite, 'home inspection site live');
  assert(snap.inspectionSite?.todayCount != null, 'home not placeholder');

  setMockLocationResult({ ok: true, fix: { latitude: 24.0, longitude: 121.0, accuracy: 5, mocked: false } });
  await editSite(admin, siteA.id, { latitude: 25.033, longitude: 121.565, attendanceRadius: 50 });
  const remote = await startInspectionFromQr(inspectorActor, employeeQr.qrCode, {
    at: sessionAt,
    siteId: siteA.id,
    latitude: 24.0,
    longitude: 121.0,
    skipCooldown: true,
  });
  assert(remote.verification.remoteInspectionWarning, 'remote warning');
  assert((remote.verification.inspectorDistanceMeters ?? 0) > 50, 'distance shown');
  const remoteLogs = (await listAuditLogs(seeded.tenant.id)).filter((item) => item.description.includes('遠端 GPS'));
  assert(remoteLogs.length >= 1, 'remote gps audited');

  const filename = db.filename;
  db.close();
  const reopened = createBetterSqliteDatabase(filename);
  setDatabase(reopened);
  const stillSession = await getInspectionSessionById(started.session.id, seeded.tenant.id);
  assert(stillSession?.employeeNameSnapshot === '陳守成', 'sqlite reopen keeps inspection');
  const stillRec = await getDisciplinaryRecommendationById(rec2.id, seeded.tenant.id);
  assert(stillRec?.status === 'rejected', 'rejected rec persists');
  reopened.close();

  const upgradeDb = createBetterSqliteDatabase(path.join(os.tmpdir(), `qinguan-p2c-up-${createId()}.db`));
  setDatabase(upgradeDb);
  configureKvStore(new MemoryKvStore());
  await applyThrough006(upgradeDb);
  await upgradeDb.run(
    `INSERT INTO tenants (id, official_name, short_name, tax_id, phone, address, logo_uri, industry_type, status, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('t-keep', '保留公司', '保留', NULL, NULL, NULL, NULL, NULL, 'active', NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [new Date().toISOString(), new Date().toISOString()],
  );
  await upgradeDb.run(
    `INSERT INTO sites (id, tenant_id, site_code, name, address, latitude, longitude, attendance_radius, require_gps, require_site_qr, status, starts_at, expires_at, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('s-keep', 't-keep', 'KEEP', '保留案場', NULL, NULL, NULL, NULL, 0, 0, 'active', NULL, NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [new Date().toISOString(), new Date().toISOString()],
  );
  await upgradeDb.run(
    `INSERT INTO qr_assets (id, tenant_id, site_id, asset_type, target_type, target_id, display_name, qr_code, status, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('q-keep', 't-keep', 's-keep', 'employee', 'employee', 'missing', '保留QR', 'QINGUAN:v1:keep', 'active', NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [new Date().toISOString(), new Date().toISOString()],
  );
  await upgradeDb.run(
    `INSERT INTO patrol_points (id, tenant_id, site_id, name, code, require_qr, require_gps, require_photo, status, sort_order, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('pp-keep', 't-keep', 's-keep', '保留點', 'KEEP-P', 0, 0, 0, 'active', 1, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [new Date().toISOString(), new Date().toISOString()],
  );
  const upgraded = await migrate(upgradeDb);
  assert(upgraded === 7, `upgrade to 7 got ${upgraded}`);
  const keepQr = await upgradeDb.getFirst<{ qr_code: string }>('SELECT qr_code FROM qr_assets WHERE id = ?', ['q-keep']);
  assert(keepQr?.qr_code === 'QINGUAN:v1:keep', 'qr kept after 006→007');
  const keepSite = await upgradeDb.getFirst<{ name: string }>('SELECT name FROM sites WHERE id = ?', ['s-keep']);
  assert(keepSite?.name === '保留案場', 'phase2a site kept');
  const keepPoint = await upgradeDb.getFirst<{ name: string }>('SELECT name FROM patrol_points WHERE id = ?', ['pp-keep']);
  assert(keepPoint?.name === '保留點', 'patrol kept');
  const inspTables = await upgradeDb.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='inspection_sessions'`,
  );
  assert(inspTables.length === 1, '007 tables created');
  upgradeDb.close();

  console.log('phase2c tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
