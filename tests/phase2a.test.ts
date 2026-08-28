import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import { getLeaveAttachmentById, getLeaveRequestById } from '@/repositories/leaveRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { assignRoleToUser } from '@/services/roleService';
import { assignUserToSite, createSite } from '@/services/siteService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { setMockLocationResult, resetLocationProvider } from '@/services/locationProvider';
import {
  cancelSchedule,
  createSchedule,
  createShiftTemplate,
  previewCopySchedules,
  commitCopySchedules,
  ScheduleDecisionError,
  setUserStaffingMode,
} from '@/services/scheduleService';
import { evaluateAttendanceStatus, clockIn, requestAttendanceCorrection, reviewAttendanceCorrection } from '@/services/attendanceService';
import { startWorkSession, endWorkSession } from '@/services/workSessionService';
import {
  attachLeaveFile,
  getLeaveAttachmentForViewer,
  recordLeaveInterview,
  refreshLeaveBalances,
  refreshSickLeaveOverdue,
  reviewLeaveRequest,
  submitLeaveRequest,
} from '@/services/leaveService';
import { taiwanLeavePolicy } from '@/services/taiwanLeavePolicyService';
import { getDashboardSnapshot } from '@/services/dashboardService';
import { getWorkScheduleById } from '@/repositories/workforceRepository';
import { STAFFING_MODES } from '@/constants/staffing';
import { formatDateTimeZh } from '@/utils/datetime';
import { haversineMeters } from '@/utils/geo';
import { createId } from '@/utils/id';
import { buildShiftRange } from '@/utils/scheduleTime';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p2a'): ActorContext {
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
  const filename = path.join(os.tmpdir(), `qinguan-p2a-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  resetLocationProvider();
  return Object.assign(db, { filename });
}

async function createStaff(
  adminActor: ActorContext,
  tenant: Tenant,
  input: { fullName: string; account: string; siteId: string; extraSites?: string[] },
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
  for (const extra of input.extraSites ?? []) {
    await assignUserToSite(adminActor, {
      tenantId: tenant.id,
      userId: pending.id,
      siteId: extra,
      startsAt: null,
      expiresAt: null,
      isPermanent: true,
      targetName: input.fullName,
      siteName: 'site',
    });
  }
  const user = await findAccountGlobally(input.account);
  assert(user, 'staff missing');
  return user;
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `expected schema ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(await isForeignKeysEnabled(db), 'FK must be on');

  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  );
  const names = tables.map((t) => t.name);
  for (const name of [
    'workforce_settings',
    'shift_templates',
    'work_schedules',
    'attendance_records',
    'attendance_correction_requests',
    'work_sessions',
    'leave_policies',
    'leave_balances',
    'leave_requests',
    'leave_request_attachments',
    'preferred_days_off',
    'schedule_leave_links',
    'app_notifications',
  ]) {
    assert(names.includes(name), `missing table ${name}`);
  }

  const seeded = await seed('晨光', 'p2a.admin');
  const admin = asActor(seeded.user);
  const sites = await db.getAll<{ id: string; name: string }>(`SELECT id, name FROM sites WHERE tenant_id = ?`, [
    seeded.tenant.id,
  ]);
  const siteA = sites[0];
  assert(siteA, 'site A missing');
  const siteB = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-B',
    name: '龍潭寶地',
    address: '桃園',
    latitude: 25.033,
    longitude: 121.565,
    attendanceRadius: 150,
    requireGps: true,
  });
  await db.run(`UPDATE sites SET latitude = 25.033, longitude = 121.565, attendance_radius = 150, require_gps = 1 WHERE id = ?`, [
    siteA.id,
  ]);

  const day = await createShiftTemplate(admin, { name: '日班', code: 'DAY', startTime: '08:00', endTime: '20:00' });
  assert(day.plannedMinutes === 720, 'day shift minutes');
  const night = await createShiftTemplate(admin, { name: '夜班', code: 'NIGHT', startTime: '20:00', endTime: '08:00' });
  assert(night.crossesMidnight, 'night should cross midnight');
  assert(night.plannedMinutes === 720, `overnight minutes ${night.plannedMinutes}`);
  const range = buildShiftRange({ workDate: '2026-09-01', startTime: '20:00', endTime: '08:00' });
  assert(range.end.getTime() > range.start.getTime(), 'overnight end after start');

  const wang = await createStaff(admin, seeded.tenant, { fullName: '王守成', account: 'wang.sc', siteId: siteA.id });
  const chen = await createStaff(admin, seeded.tenant, {
    fullName: '陳見習',
    account: 'chen.tr',
    siteId: siteA.id,
    extraSites: [siteB.id],
  });
  const mobile = await createStaff(admin, seeded.tenant, {
    fullName: '李機動',
    account: 'li.mb',
    siteId: siteA.id,
    extraSites: [siteB.id],
  });
  await setUserStaffingMode(admin, chen.id, STAFFING_MODES.TRAINEE);
  await setUserStaffingMode(admin, mobile.id, STAFFING_MODES.MOBILE);

  const s1 = await createSchedule(admin, {
    userId: wang.id,
    siteId: siteA.id,
    workDate: '2026-09-01',
    shiftTemplateId: day.id,
  });
  assert(s1.scheduledStartAt < s1.scheduledEndAt, 'normal schedule times');

  await expectFailure(
    () =>
      createSchedule(admin, {
        userId: wang.id,
        siteId: siteA.id,
        workDate: '2026-09-01',
        shiftTemplateId: day.id,
      }),
    '衝突',
    'fixed overlap should fail',
  );

  const m1 = await createSchedule(admin, {
    userId: mobile.id,
    siteId: siteA.id,
    workDate: '2026-09-02',
    scheduledStartAt: new Date(2026, 8, 2, 8, 0).toISOString(),
    scheduledEndAt: new Date(2026, 8, 2, 12, 0).toISOString(),
    scheduleType: 'support',
  });
  const m2 = await createSchedule(admin, {
    userId: mobile.id,
    siteId: siteB.id,
    workDate: '2026-09-02',
    scheduledStartAt: new Date(2026, 8, 2, 13, 0).toISOString(),
    scheduledEndAt: new Date(2026, 8, 2, 17, 0).toISOString(),
    scheduleType: 'support',
    restOverrideReason: '同日多案場機動支援',
  });
  assert(m1.id !== m2.id, 'mobile multi site same day');

  await expectFailure(
    () =>
      createSchedule(admin, {
        userId: mobile.id,
        siteId: siteB.id,
        workDate: '2026-09-02',
        scheduledStartAt: new Date(2026, 8, 2, 10, 0).toISOString(),
        scheduledEndAt: new Date(2026, 8, 2, 14, 0).toISOString(),
      }),
    '衝突',
    'mobile overlap should fail',
  );

  const t1 = await createSchedule(admin, {
    userId: chen.id,
    siteId: siteA.id,
    workDate: '2026-09-03',
    shiftTemplateId: day.id,
    scheduleType: 'training',
  });
  try {
    await createSchedule(admin, {
      userId: chen.id,
      siteId: siteB.id,
      workDate: '2026-09-03',
      shiftTemplateId: day.id,
    });
    throw new Error('trainee overlap should warn by default');
  } catch (error) {
    assert(error instanceof ScheduleDecisionError, 'expected decision error');
    assert(error.warnings.some((w) => w.type === 'training_overlap'), 'trainee warning missing');
  }
  const t2 = await createSchedule(admin, {
    userId: chen.id,
    siteId: siteB.id,
    workDate: '2026-09-03',
    shiftTemplateId: day.id,
    allowTrainingOverlap: true,
    trainingReason: '新人帶訓',
    trainerUserId: wang.id,
  });
  assert(t2.allowTrainingOverlap, 'training overlap saved');
  const logs = await listAuditLogs(seeded.tenant.id);
  assert(
    logs.some((l) => l.description.includes('允許見習人員') && l.description.includes('陳見習') && l.actorNameSnapshot.includes('管理員')),
    'training overlap audit missing',
  );

  const restDay = await createSchedule(admin, {
    userId: wang.id,
    siteId: siteA.id,
    workDate: '2026-09-10',
    scheduledStartAt: new Date(2026, 8, 10, 8, 0).toISOString(),
    scheduledEndAt: new Date(2026, 8, 10, 20, 0).toISOString(),
  });
  try {
    await createSchedule(admin, {
      userId: wang.id,
      siteId: siteA.id,
      workDate: '2026-09-10',
      scheduledStartAt: new Date(2026, 8, 10, 22, 0).toISOString(),
      scheduledEndAt: new Date(2026, 8, 11, 6, 0).toISOString(),
    });
    throw new Error('insufficient rest should require reason');
  } catch (error) {
    assert(error instanceof ScheduleDecisionError, 'rest warning');
    assert(error.warnings.some((w) => w.type === 'insufficient_rest'), 'rest not detected');
  }
  const forced = await createSchedule(admin, {
    userId: wang.id,
    siteId: siteA.id,
    workDate: '2026-09-10',
    scheduledStartAt: new Date(2026, 8, 10, 22, 0).toISOString(),
    scheduledEndAt: new Date(2026, 8, 11, 6, 0).toISOString(),
    restOverrideReason: '臨時支援夜班',
  });
  assert(forced.overrideReason === '臨時支援夜班', 'override reason saved');
  assert(
    (await listAuditLogs(seeded.tenant.id)).some((l) => l.description.includes('休息不足') && l.description.includes('臨時支援夜班')),
    'rest override audit',
  );

  const overnight = await createSchedule(admin, {
    userId: mobile.id,
    siteId: siteA.id,
    workDate: '2026-09-12',
    shiftTemplateId: night.id,
  });
  await expectFailure(
    () =>
      createSchedule(admin, {
        userId: mobile.id,
        siteId: siteB.id,
        workDate: '2026-09-13',
        scheduledStartAt: new Date(2026, 8, 13, 6, 0).toISOString(),
        scheduledEndAt: new Date(2026, 8, 13, 12, 0).toISOString(),
      }),
    '衝突',
    'overnight overlap should fail',
  );

  await cancelSchedule(admin, overnight.id);
  const afterCancel = await createSchedule(admin, {
    userId: mobile.id,
    siteId: siteB.id,
    workDate: '2026-09-13',
    scheduledStartAt: new Date(2026, 8, 13, 6, 0).toISOString(),
    scheduledEndAt: new Date(2026, 8, 13, 12, 0).toISOString(),
  });
  assert(afterCancel.id, 'cancelled should not block');

  const outsider = await createStaff(admin, seeded.tenant, { fullName: '無授權', account: 'no.auth', siteId: siteA.id });
  await expectFailure(
    () =>
      createSchedule(admin, {
        userId: outsider.id,
        siteId: siteB.id,
        workDate: '2026-09-20',
        shiftTemplateId: day.id,
      }),
    '授權',
    'no site grant should fail',
  );

  const preview = await previewCopySchedules(admin, {
    siteId: siteA.id,
    sourceStart: '2026-09-01',
    sourceEnd: '2026-09-01',
    targetStart: '2026-09-21',
  });
  assert(preview.ok.length + preview.conflicts.length >= 1, 'copy preview');
  const committed = await commitCopySchedules(admin, {
    siteId: siteA.id,
    sourceStart: '2026-09-01',
    sourceEnd: '2026-09-01',
    targetStart: '2026-09-21',
  });
  assert(committed.created.length === preview.ok.length, 'copy commit matches ok');

  const wangActor: ActorContext = {
    ...asActor(wang, siteA.id),
    roleSnapshot: '一般勤務人員',
  };
  setMockLocationResult({ ok: true, fix: { latitude: 25.033, longitude: 121.565 } });
  const inRange = await clockIn(wangActor, {
    siteId: siteA.id,
    scheduleId: s1.id,
    at: new Date(2026, 8, 1, 8, 4).toISOString(),
  });
  assert(inRange.clockInAt, 'gps in range');
  assert(inRange.status === 'normal', `late grace failed: ${inRange.status}`);

  await expectFailure(
    async () => {
      setMockLocationResult({ ok: true, fix: { latitude: 25.04, longitude: 121.58 } });
      const dist = haversineMeters(25.04, 121.58, 25.033, 121.565);
      assert(dist > 150, 'test point should be outside');
      await clockIn(
        { ...asActor(mobile, siteB.id), roleSnapshot: '一般勤務人員' },
        { siteId: siteB.id, at: new Date().toISOString() },
      );
    },
    '距離',
    'gps out of range',
  );

  assert(
    evaluateAttendanceStatus({
      scheduledStartAt: new Date(2026, 8, 1, 8, 0).toISOString(),
      clockInAt: new Date(2026, 8, 1, 8, 6).toISOString(),
      lateGraceMinutes: 5,
      earlyLeaveGraceMinutes: 5,
    }) === 'late',
    'late detection',
  );
  assert(
    evaluateAttendanceStatus({
      scheduledStartAt: new Date(2026, 8, 1, 8, 0).toISOString(),
      scheduledEndAt: new Date(2026, 8, 1, 20, 0).toISOString(),
      clockInAt: new Date(2026, 8, 1, 8, 0).toISOString(),
      clockOutAt: new Date(2026, 8, 1, 19, 50).toISOString(),
      lateGraceMinutes: 5,
      earlyLeaveGraceMinutes: 5,
    }) === 'early_leave',
    'early leave detection',
  );

  const corr = await requestAttendanceCorrection(wangActor, {
    siteId: siteA.id,
    attendanceId: inRange.id,
    requestType: 'incorrect_time',
    requestedClockInAt: new Date(2026, 8, 1, 8, 0).toISOString(),
    reason: '定位延遲',
  });
  await expectFailure(
    () => reviewAttendanceCorrection(wangActor, corr.id, 'approved'),
    '權限',
    'staff cannot approve',
  );
  const approvedCorr = await reviewAttendanceCorrection(admin, corr.id, 'approved', '准');
  assert(approvedCorr.status === 'approved', 'correction approved');

  setMockLocationResult({ ok: true, fix: { latitude: 25.033, longitude: 121.565 } });
  const duty = await startWorkSession(wangActor, { siteId: siteA.id, scheduleId: s1.id });
  assert(duty.status === 'active', 'session started');
  await expectFailure(
    () => startWorkSession(wangActor, { siteId: siteA.id }),
    '勤務中',
    'second active session blocked',
  );
  const mobileActor: ActorContext = { ...asActor(mobile, siteA.id), roleSnapshot: '一般勤務人員' };
  const ms1 = await startWorkSession(mobileActor, { siteId: siteA.id, scheduleId: m1.id });
  await expectFailure(
    () => startWorkSession(mobileActor, { siteId: siteB.id, scheduleId: m2.id }),
    '勤務中',
    'mobile cannot have two active sessions',
  );
  const ended = await endWorkSession(wangActor);
  assert(ended.session.status === 'completed', 'session ended');
  assert(ended.missingClockOut, 'should remind clock out');
  await endWorkSession(mobileActor);

  const other = await seed('他司', 'other.admin', '他司案場');
  const otherActor = asActor(other.user);
  await expectFailure(
    () => createSchedule(otherActor, { userId: wang.id, siteId: siteA.id, workDate: '2026-10-01', shiftTemplateId: day.id }),
    '無權',
    'cross tenant schedule rejected',
  );

  const pdo1 = await submitLeaveRequest(wangActor, {
    leaveType: 'preferred_day_off',
    startDate: '2026-09-08',
    endDate: '2026-09-08',
  });
  await submitLeaveRequest(wangActor, {
    leaveType: 'preferred_day_off',
    startDate: '2026-09-19',
    endDate: '2026-09-19',
  });
  await expectFailure(
    () =>
      submitLeaveRequest(wangActor, {
        leaveType: 'preferred_day_off',
        startDate: '2026-09-20',
        endDate: '2026-09-20',
      }),
    '上限',
    'third preferred day off blocked',
  );
  await reviewLeaveRequest(admin, pdo1.id, 'approved');

  await refreshLeaveBalances(seeded.tenant.id, wang.id, new Date('2026-09-01'));
  const entitlement = taiwanLeavePolicy.annualLeaveEntitlementDays('2024-01-01', new Date('2026-09-01'));
  assert(entitlement === 10, `annual leave years ${entitlement}`);
  const urgentAnnual = await submitLeaveRequest(wangActor, {
    leaveType: 'annual_leave',
    startDate: '2026-09-15',
    endDate: '2026-09-15',
  });
  assert(urgentAnnual.isUrgent, 'annual leave urgent flag');
  await expectFailure(
    () =>
      submitLeaveRequest(wangActor, {
        leaveType: 'annual_leave',
        startDate: '2026-11-01',
        endDate: '2026-11-20',
        days: 20,
      }),
    '餘額',
    'cannot request more than remaining',
  );

  const sick = await submitLeaveRequest(wangActor, {
    leaveType: 'sick_leave',
    startDate: '2026-09-22',
    endDate: '2026-09-22',
    reason: '感冒',
  });
  assert(sick.status === 'document_pending', 'sick can submit without file');
  const att = await attachLeaveFile(wangActor, sick.id, {
    fileName: '診斷證明.pdf',
    mimeType: 'application/pdf',
    localUri: 'memory://diag.pdf',
    kind: 'medical',
  });
  assert(att.fileName === '診斷證明.pdf', 'pdf metadata');
  await refreshSickLeaveOverdue(seeded.tenant.id, new Date(Date.now() + 80 * 3600 * 1000));
  const overdueProbe = await submitLeaveRequest(wangActor, {
    leaveType: 'sick_leave',
    startDate: '2026-09-23',
    endDate: '2026-09-23',
  });
  await refreshSickLeaveOverdue(seeded.tenant.id, new Date(Date.now() + 80 * 3600 * 1000));
  const overdue = await getLeaveRequestById(overdueProbe.id, seeded.tenant.id);
  assert(overdue?.status === 'document_overdue', 'overdue status');
  assert(overdue?.documentStatus === 'overdue', 'must not auto absent');

  assert(taiwanLeavePolicy.bereavementEntitlementDays('parent') === 8, 'bereavement 8');
  assert(taiwanLeavePolicy.bereavementEntitlementDays('grandparent') === 6, 'bereavement 6');
  assert(taiwanLeavePolicy.bereavementEntitlementDays('sibling') === 3, 'bereavement 3');
  const bereave = await submitLeaveRequest(wangActor, {
    leaveType: 'bereavement_leave',
    startDate: '2026-09-25',
    endDate: '2026-09-27',
    days: 3,
    bereavementRelation: 'parent',
  });
  await attachLeaveFile(wangActor, bereave.id, {
    fileName: '訃文.jpg',
    mimeType: 'image/jpeg',
    localUri: 'memory://obit.jpg',
    kind: 'obituary',
  });

  const personal1 = await submitLeaveRequest(wangActor, {
    leaveType: 'personal_leave',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    days: 3,
    urgentReason: '家庭因素',
  });
  assert(!personal1.managerInterviewRequired, 'first 3 days no interview');
  const personal2 = await submitLeaveRequest(wangActor, {
    leaveType: 'personal_leave',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    days: 2,
    urgentReason: '家庭因素',
  });
  assert(personal2.managerInterviewRequired, 'interview required after 3 days');
  await expectFailure(
    () => reviewLeaveRequest(admin, personal2.id, 'approved'),
    '面談',
    'cannot approve without interview',
  );
  await recordLeaveInterview(admin, personal2.id, { content: '已面談，同意', result: 'ok' });
  await reviewLeaveRequest(admin, personal2.id, 'approved');

  const official = await submitLeaveRequest(wangActor, {
    leaveType: 'official_leave',
    startDate: '2026-10-20',
    endDate: '2026-10-20',
    officialBasis: '兵役召集',
    reason: '公假',
  });
  await attachLeaveFile(wangActor, official.id, {
    fileName: '公文.pdf',
    mimeType: 'application/pdf',
    localUri: 'memory://official.pdf',
    kind: 'official',
  });

  await expectFailure(() => reviewLeaveRequest(wangActor, official.id, 'approved'), '權限', 'cannot self approve');

  const linked = await createSchedule(admin, {
    userId: wang.id,
    siteId: siteA.id,
    workDate: '2026-11-08',
    shiftTemplateId: day.id,
  });
  const leaveOnShift = await submitLeaveRequest(wangActor, {
    leaveType: 'annual_leave',
    startDate: '2026-11-08',
    endDate: '2026-11-08',
  });
  await reviewLeaveRequest(admin, leaveOnShift.id, 'approved');
  const still = await getWorkScheduleById(linked.id, seeded.tenant.id);
  assert(still, 'schedule kept');
  assert(still.leaveStatus === 'leave_approved', 'leave approved marker');

  const dash = await getDashboardSnapshot(admin, { siteId: siteA.id, at: new Date(2026, 8, 1, 10, 0) });
  assert(dash.managerStats, 'manager stats');
  assert(typeof dash.managerStats.expected === 'number', 'expected is number');

  const replacementUser = await createStaff(admin, seeded.tenant, {
    fullName: '代班員',
    account: 'rep.one',
    siteId: siteA.id,
  });
  await createSchedule(admin, {
    userId: replacementUser.id,
    siteId: siteA.id,
    workDate: '2026-11-08',
    scheduledStartAt: new Date(2026, 10, 8, 8, 0).toISOString(),
    scheduledEndAt: new Date(2026, 10, 8, 12, 0).toISOString(),
  });
  await expectFailure(
    () =>
      createSchedule(admin, {
        userId: replacementUser.id,
        siteId: siteA.id,
        workDate: '2026-11-08',
        shiftTemplateId: day.id,
        scheduleType: 'replacement',
      }),
    '衝突',
    'replacement still overlap-checked',
  );

  await expectFailure(
    () => getLeaveAttachmentForViewer(otherActor, att.id),
    '無權',
    'cross tenant attachment',
  );

  const namedLog = (await listAuditLogs(seeded.tenant.id)).find((l) => l.actorNameSnapshot && l.createdAt);
  assert(namedLog, 'audit exists');
  assert(formatDateTimeZh(namedLog.createdAt).includes('年'), 'zh datetime');

  db.close();
  const reopened = createBetterSqliteDatabase(db.filename);
  setDatabase(reopened);
  await migrate(reopened);
  assert((await getSchemaVersion(reopened)) === CURRENT_SCHEMA_VERSION, 'reopen version');
  assert(await findAccountGlobally('wang.sc'), 'user persisted');
  assert(await getWorkScheduleById(s1.id, seeded.tenant.id), 'schedule persisted');
  assert(await getLeaveRequestById(sick.id, seeded.tenant.id), 'leave persisted');
  assert(await getLeaveAttachmentById(att.id, seeded.tenant.id), 'attachment persisted');
  reopened.close();
  fs.unlinkSync(db.filename);

  const upgradeFile = path.join(os.tmpdir(), `qinguan-p2a-up-${createId()}.db`);
  const up = createBetterSqliteDatabase(upgradeFile);
  setDatabase(up);
  configureKvStore(new MemoryKvStore());
  await up.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL);`);
  await up.exec(MIGRATION_001_SQL);
  await up.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [1, '001_initial', new Date().toISOString()]);
  const before = await seed('升級二', 'up2.admin');
  const beforeLogs = await listAuditLogs(before.tenant.id);
  const afterV = await migrate(up);
  assert(afterV === CURRENT_SCHEMA_VERSION, 'upgrade to 3');
  assert((await findAccountGlobally('up2.admin'))?.id === before.user.id, 'upgrade kept user');
  assert((await listAuditLogs(before.tenant.id)).length === beforeLogs.length, 'upgrade kept audit');
  const p2tables = await up.getAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE name='work_schedules'`);
  assert(p2tables.length === 1, '003 tables after upgrade');
  up.close();
  fs.unlinkSync(upgradeFile);

  console.log('Phase 2A tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
