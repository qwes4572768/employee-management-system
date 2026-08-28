import { CLOCK_METHODS } from '@/constants/workforce';
import {
  getAttendanceById,
  getAttendanceBySchedule,
  getCorrectionById,
  getOpenAttendance,
  insertAttendance,
  insertCorrectionRequest,
  listPendingCorrections,
  updateAttendance,
  updateCorrection,
} from '@/repositories/attendanceRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getUserById } from '@/repositories/userRepository';
import { requireWorkforceSettings, getWorkScheduleById } from '@/repositories/workforceRepository';
import type { AttendanceCorrectionRequest, AttendanceRecord } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { haversineMeters, isValidCoordinate } from '@/utils/geo';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getLocationProvider } from './locationProvider';
import { requireActorTenant, requireSiteInTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';
import { userHasSiteAuthorization } from './workforceWarningService';

const QR_NOT_READY = '此案場設定需要 QR 驗證，QR 模組尚未啟用';

export class GpsClockError extends Error {
  readonly distanceMeters?: number;
  readonly allowedMeters?: number;

  constructor(message: string, distanceMeters?: number, allowedMeters?: number) {
    super(message);
    this.name = 'GpsClockError';
    this.distanceMeters = distanceMeters;
    this.allowedMeters = allowedMeters;
  }
}

async function resolveClockLocation(actor: ActorContext, siteId: string, tenantId: string) {
  const site = await requireSiteInTenant(siteId, tenantId);
  if (site.requireSiteQr) {
    throw new Error(QR_NOT_READY);
  }
  if (!site.requireGps) {
    return { site, latitude: null as number | null, longitude: null as number | null, distance: null as number | null, method: CLOCK_METHODS.MANUAL };
  }
  const result = await getLocationProvider().getCurrentPosition();
  if (!result.ok) {
    await writeAudit({
      actor,
      action: 'update',
      module: 'attendance',
      result: 'failure',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} GPS 驗證失敗：${result.message}`,
      targetType: 'site',
      targetId: site.id,
      targetDisplayName: site.name,
      siteId: site.id,
    });
    throw new GpsClockError(result.message);
  }
  if (!isValidCoordinate(result.fix.latitude, result.fix.longitude)) {
    throw new GpsClockError('取得的座標無效');
  }
  if (site.latitude == null || site.longitude == null || site.attendanceRadius == null) {
    throw new GpsClockError('此案場尚未設定 GPS 中心或打卡範圍');
  }
  const distance = Math.round(
    haversineMeters(result.fix.latitude, result.fix.longitude, site.latitude, site.longitude),
  );
  if (distance > site.attendanceRadius) {
    await writeAudit({
      actor,
      action: 'update',
      module: 'attendance',
      result: 'failure',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} GPS 驗證失敗：距離案場 ${distance} 公尺，允許 ${site.attendanceRadius} 公尺`,
      targetType: 'site',
      targetId: site.id,
      targetDisplayName: site.name,
      siteId: site.id,
    });
    throw new GpsClockError(
      `您目前距離案場 ${distance} 公尺\n允許打卡範圍：${site.attendanceRadius} 公尺`,
      distance,
      site.attendanceRadius,
    );
  }
  return {
    site,
    latitude: result.fix.latitude,
    longitude: result.fix.longitude,
    distance,
    method: CLOCK_METHODS.GPS,
  };
}

function computeAttendanceStatus(input: {
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
}): string {
  if (!input.clockInAt) return 'missing_clock_in';
  let status = 'normal';
  if (input.scheduledStartAt && input.clockInAt) {
    const start = new Date(input.scheduledStartAt).getTime();
    const inn = new Date(input.clockInAt).getTime();
    if (inn > start + input.lateGraceMinutes * 60000) {
      status = 'late';
    }
  }
  if (input.scheduledEndAt && input.clockOutAt) {
    const end = new Date(input.scheduledEndAt).getTime();
    const out = new Date(input.clockOutAt).getTime();
    if (out < end - input.earlyLeaveGraceMinutes * 60000) {
      return status === 'late' ? 'exception' : 'early_leave';
    }
  }
  return status;
}

export function evaluateAttendanceStatus(input: {
  scheduledStartAt: string;
  scheduledEndAt?: string | null;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
}): string {
  return computeAttendanceStatus(input);
}

export async function clockIn(
  actor: ActorContext,
  input: { siteId: string; scheduleId?: string | null; at?: string; note?: string | null },
): Promise<AttendanceRecord> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'attendance.clock');
  if (!actor.userId) throw new Error('缺少操作者');
  const user = await requireUserInTenant(actor.userId, tenantId);
  if (!(await userHasSiteAuthorization(user.id, tenantId, input.siteId))) {
    throw new Error('沒有此案場授權');
  }
  const located = await resolveClockLocation(actor, input.siteId, tenantId);
  const settings = await requireWorkforceSettings(tenantId);
  let schedule = input.scheduleId ? await getWorkScheduleById(input.scheduleId, tenantId) : null;
  if (input.scheduleId && !schedule) {
    const existing = await getWorkScheduleById(input.scheduleId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到排班');
  }
  if (schedule && schedule.userId !== user.id) {
    throw new Error('只能為自己的班表打卡');
  }
  const existingOpen = await getOpenAttendance(tenantId, user.id, located.site.id);
  if (existingOpen) {
    throw new Error('已有未完成的上班打卡，請先下班打卡');
  }
  if (schedule) {
    const existing = await getAttendanceBySchedule(tenantId, schedule.id);
    if (existing?.clockInAt) {
      throw new Error('此班表已打過上班卡');
    }
  }
  const at = input.at ?? nowIso();
  const record = await insertAttendance({
    tenantId,
    siteId: located.site.id,
    userId: user.id,
    scheduleId: schedule?.id ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const status = computeAttendanceStatus({
    scheduledStartAt: schedule?.scheduledStartAt,
    scheduledEndAt: schedule?.scheduledEndAt,
    clockInAt: at,
    lateGraceMinutes: settings.lateGraceMinutes,
    earlyLeaveGraceMinutes: settings.earlyLeaveGraceMinutes,
  });
  const updated = await updateAttendance(record.id, tenantId, {
    clockInAt: at,
    clockInLatitude: located.latitude,
    clockInLongitude: located.longitude,
    clockInDistanceMeters: located.distance,
    clockInMethod: located.method,
    clockInNote: input.note ?? null,
    status,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'attendance',
    description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${located.site.name}」上班打卡`,
    targetType: 'attendance',
    targetId: updated.id,
    targetDisplayName: user.fullName,
    after: updated,
    siteId: located.site.id,
  });
  return updated;
}

export async function clockOut(
  actor: ActorContext,
  input: { siteId: string; attendanceId?: string; at?: string; note?: string | null },
): Promise<AttendanceRecord> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'attendance.clock');
  if (!actor.userId) throw new Error('缺少操作者');
  const user = await requireUserInTenant(actor.userId, tenantId);
  const located = await resolveClockLocation(actor, input.siteId, tenantId);
  const open = input.attendanceId
    ? await getAttendanceById(input.attendanceId, tenantId)
    : await getOpenAttendance(tenantId, user.id, located.site.id);
  if (!open) {
    throw new Error('找不到可下班的打卡紀錄');
  }
  if (open.userId !== user.id) {
    throw new Error('只能為自己下班打卡');
  }
  if (open.clockOutAt) {
    throw new Error('此筆出勤已下班打卡');
  }
  const settings = await requireWorkforceSettings(tenantId);
  const schedule = open.scheduleId ? await getWorkScheduleById(open.scheduleId, tenantId) : null;
  const at = input.at ?? nowIso();
  const status = computeAttendanceStatus({
    scheduledStartAt: schedule?.scheduledStartAt,
    scheduledEndAt: schedule?.scheduledEndAt,
    clockInAt: open.clockInAt,
    clockOutAt: at,
    lateGraceMinutes: settings.lateGraceMinutes,
    earlyLeaveGraceMinutes: settings.earlyLeaveGraceMinutes,
  });
  const updated = await updateAttendance(open.id, tenantId, {
    clockOutAt: at,
    clockOutLatitude: located.latitude,
    clockOutLongitude: located.longitude,
    clockOutDistanceMeters: located.distance,
    clockOutMethod: located.method,
    clockOutNote: input.note ?? null,
    status,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'attendance',
    description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${located.site.name}」下班打卡`,
    targetType: 'attendance',
    targetId: updated.id,
    targetDisplayName: user.fullName,
    after: updated,
    siteId: located.site.id,
  });
  return updated;
}

export async function requestAttendanceCorrection(
  actor: ActorContext,
  input: {
    siteId: string;
    attendanceId?: string | null;
    scheduleId?: string | null;
    requestType: AttendanceCorrectionRequest['requestType'];
    requestedClockInAt?: string | null;
    requestedClockOutAt?: string | null;
    reason: string;
  },
): Promise<AttendanceCorrectionRequest> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'attendance.correct.request');
  if (!actor.userId) throw new Error('缺少操作者');
  if (!input.reason.trim()) throw new Error('請填寫補卡理由');
  const user = await requireUserInTenant(actor.userId, tenantId);
  await requireSiteInTenant(input.siteId, tenantId);
  const attendance = input.attendanceId ? await getAttendanceById(input.attendanceId, tenantId) : null;
  if (input.attendanceId && !attendance) {
    const existing = await getAttendanceById(input.attendanceId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到出勤紀錄');
  }
  const created = await insertCorrectionRequest({
    tenantId,
    siteId: input.siteId,
    userId: user.id,
    attendanceId: attendance?.id ?? null,
    scheduleId: input.scheduleId ?? attendance?.scheduleId ?? null,
    requestType: input.requestType,
    requestedClockInAt: input.requestedClockInAt ?? null,
    requestedClockOutAt: input.requestedClockOutAt ?? null,
    reason: input.reason,
    originalClockInAt: attendance?.clockInAt ?? null,
    originalClockOutAt: attendance?.clockOutAt ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'attendance',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 提出補卡申請`,
    targetType: 'attendance_correction',
    targetId: created.id,
    targetDisplayName: user.fullName,
    after: created,
    siteId: input.siteId,
  });
  return created;
}

export async function reviewAttendanceCorrection(
  actor: ActorContext,
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string | null,
): Promise<AttendanceCorrectionRequest> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'attendance.correct.approve');
  const request = await getCorrectionById(requestId, tenantId);
  if (!request) {
    const existing = await getCorrectionById(requestId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到補卡申請');
  }
  if (request.userId === actor.userId) {
    throw new Error('申請人不能自行核准補卡');
  }
  if (request.status !== 'pending') {
    throw new Error('此申請已審核');
  }
  if (decision === 'rejected' && !reviewNote?.trim()) {
    throw new Error('拒絕補卡必須填寫原因');
  }
  const reviewed = await updateCorrection(requestId, tenantId, {
    status: decision,
    reviewedBy: actor.userId,
    reviewedAt: nowIso(),
    reviewNote: reviewNote ?? null,
  });
  if (decision === 'approved') {
    let attendance = request.attendanceId ? await getAttendanceById(request.attendanceId, tenantId) : null;
    if (!attendance) {
      attendance = await insertAttendance({
        tenantId,
        siteId: request.siteId,
        userId: request.userId,
        scheduleId: request.scheduleId,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      });
    }
    const settings = await requireWorkforceSettings(tenantId);
    const schedule = attendance.scheduleId ? await getWorkScheduleById(attendance.scheduleId, tenantId) : null;
    const clockInAt = request.requestedClockInAt ?? attendance.clockInAt;
    const clockOutAt = request.requestedClockOutAt ?? attendance.clockOutAt;
    await updateAttendance(attendance.id, tenantId, {
      clockInAt,
      clockOutAt,
      status: computeAttendanceStatus({
        scheduledStartAt: schedule?.scheduledStartAt,
        scheduledEndAt: schedule?.scheduledEndAt,
        clockInAt,
        clockOutAt,
        lateGraceMinutes: settings.lateGraceMinutes,
        earlyLeaveGraceMinutes: settings.earlyLeaveGraceMinutes,
      }),
    });
  }
  const applicant = await getUserById(request.userId, tenantId);
  const site = await getSiteById(request.siteId, tenantId);
  await writeAudit({
    actor,
    action: decision === 'approved' ? 'approve' : 'update',
    module: 'attendance',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${decision === 'approved' ? '核准' : '拒絕'}「${applicant?.fullName ?? request.userId}」的補卡申請。原打卡：${request.originalClockInAt ?? '無'}／${request.originalClockOutAt ?? '無'}。要求更正：${request.requestedClockInAt ?? '—'}／${request.requestedClockOutAt ?? '—'}。理由：${request.reason}。${reviewNote ? `審核備註：${reviewNote}` : ''}`,
    targetType: 'attendance_correction',
    targetId: reviewed.id,
    targetDisplayName: applicant?.fullName ?? request.id,
    after: reviewed,
    siteId: site?.id,
  });
  return reviewed;
}

export async function listCorrectionsForReview(actor: ActorContext) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'attendance.correct.approve');
  return listPendingCorrections(tenantId);
}

export { getAttendanceById, getOpenAttendance };
