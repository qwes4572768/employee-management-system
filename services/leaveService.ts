import { LEAVE_STATUSES, LEAVE_TYPES, type BereavementRelation, type LeaveType } from '@/constants/leave';
import {
  ensureLeavePolicy,
  getLeaveAttachmentById,
  getLeaveBalance,
  getLeaveRequestById,
  insertLeaveAttachment,
  insertLeaveHistory,
  insertLeaveInterview,
  insertLeaveRequest,
  insertPreferredDayOff,
  listLeaveAttachments,
  listLeaveHistory,
  listLeaveInterviews,
  listLeaveRequestsForReview,
  listLeaveRequestsForUser,
  listPreferredDaysOff,
  requireLeavePolicy,
  updateLeavePolicy,
  updateLeaveRequest,
  updatePreferredDayOffStatus,
  upsertLeaveBalance,
} from '@/repositories/leaveRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getUserById, listUsersByTenant } from '@/repositories/userRepository';
import {
  insertScheduleLeaveLink,
  listActiveSchedulesForUser,
  listSchedulesForSiteDate,
  updateWorkSchedule,
} from '@/repositories/workforceRepository';
import { insertNotification } from '@/repositories/notificationRepository';
import type { LeavePolicy, LeaveRequest, LeaveRequestAttachment, WorkSchedule } from '@/types';
import { formatDateTimeZh, nowIso, parseDateOnly } from '@/utils/datetime';
import { inclusiveDayCount, yearMonthOf } from '@/utils/scheduleTime';

import { actorPermissionKeys, requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getEffectivePermissionKeys } from './permissionService';
import { taiwanLeavePolicy } from './taiwanLeavePolicyService';
import { requireActorTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';

const ACTIVE_COUNT_STATUSES = new Set([
  LEAVE_STATUSES.PENDING,
  LEAVE_STATUSES.SUBMITTED,
  LEAVE_STATUSES.APPROVED,
  LEAVE_STATUSES.DOCUMENT_PENDING,
  LEAVE_STATUSES.DOCUMENT_OVERDUE,
  LEAVE_STATUSES.INTERVIEW_REQUIRED,
]);

function periodForYear(at: Date): { start: string; end: string } {
  const year = at.getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

async function notify(tenantId: string, userId: string, title: string, body: string, kind: string, relatedId?: string) {
  await insertNotification({ tenantId, userId, title, body, kind, relatedId });
}

async function notifyApprovers(tenantId: string, title: string, body: string, kind: string, relatedId?: string) {
  const users = await listUsersByTenant(tenantId);
  for (const user of users) {
    if (user.status !== 'active') continue;
    const keys = await getEffectivePermissionKeys(user);
    if (keys.includes('leave.approve')) {
      await notify(tenantId, user.id, title, body, kind, relatedId);
    }
  }
}

export async function refreshLeaveBalances(tenantId: string, userId: string, at: Date = new Date()) {
  const user = await requireUserInTenant(userId, tenantId);
  const policy = await requireLeavePolicy(tenantId);
  const period = periodForYear(at);
  const entitlement = taiwanLeavePolicy.annualLeaveEntitlementDays(user.hireDate, at);
  const existingAnnual = await getLeaveBalance(tenantId, userId, LEAVE_TYPES.ANNUAL_LEAVE, period.start);
  const usedAnnual = existingAnnual?.usedDays ?? 0;
  const pendingAnnual = existingAnnual?.pendingDays ?? 0;
  await upsertLeaveBalance({
    tenantId,
    userId,
    leaveType: LEAVE_TYPES.ANNUAL_LEAVE,
    entitlementDays: entitlement,
    usedDays: usedAnnual,
    pendingDays: pendingAnnual,
    remainingDays: entitlement + (existingAnnual?.carryoverDays ?? 0) - usedAnnual - pendingAnnual,
    periodStart: period.start,
    periodEnd: period.end,
    carryoverDays: existingAnnual?.carryoverDays ?? 0,
    createdBy: userId,
    deviceId: null,
  });
  const existingPersonal = await getLeaveBalance(tenantId, userId, LEAVE_TYPES.PERSONAL_LEAVE, period.start);
  const cap = policy.personalLeaveAnnualMaxDays;
  const usedPersonal = existingPersonal?.usedDays ?? 0;
  const pendingPersonal = existingPersonal?.pendingDays ?? 0;
  await upsertLeaveBalance({
    tenantId,
    userId,
    leaveType: LEAVE_TYPES.PERSONAL_LEAVE,
    entitlementDays: cap,
    usedDays: usedPersonal,
    pendingDays: pendingPersonal,
    remainingDays: cap - usedPersonal - pendingPersonal,
    periodStart: period.start,
    periodEnd: period.end,
    carryoverDays: 0,
    createdBy: userId,
    deviceId: null,
  });
}

async function adjustBalance(
  tenantId: string,
  userId: string,
  leaveType: string,
  delta: { pending?: number; used?: number },
  at: Date,
) {
  await refreshLeaveBalances(tenantId, userId, at);
  const period = periodForYear(at);
  const current = await getLeaveBalance(tenantId, userId, leaveType, period.start);
  if (!current) return;
  const pendingDays = current.pendingDays + (delta.pending ?? 0);
  const usedDays = current.usedDays + (delta.used ?? 0);
  await upsertLeaveBalance({
    tenantId,
    userId,
    leaveType,
    entitlementDays: current.entitlementDays,
    usedDays,
    pendingDays,
    remainingDays: current.entitlementDays + current.carryoverDays - usedDays - pendingDays,
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    carryoverDays: current.carryoverDays,
    createdBy: userId,
    deviceId: null,
  });
}

export async function affectedSchedulesForLeave(
  tenantId: string,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<WorkSchedule[]> {
  const all = await listActiveSchedulesForUser(tenantId, userId);
  return all.filter((item) => item.workDate >= startDate && item.workDate <= endDate && item.status !== 'cancelled');
}

export async function staffingImpactIfApproved(request: LeaveRequest): Promise<{
  impacts: Array<{ siteId: string; siteName: string; workDate: string; required: number; remaining: number; shortage: number }>;
}> {
  const schedules = await affectedSchedulesForLeave(request.tenantId, request.userId, request.startDate, request.endDate);
  const impacts = [];
  for (const schedule of schedules) {
    const same = (await listSchedulesForSiteDate(request.tenantId, schedule.siteId, schedule.workDate)).filter(
      (item) => item.status !== 'cancelled',
    );
    const remaining = same.filter((item) => item.userId !== request.userId && item.leaveStatus !== 'leave_approved').length;
    const required = same.length;
    const site = await getSiteById(schedule.siteId, request.tenantId);
    impacts.push({
      siteId: schedule.siteId,
      siteName: site?.name ?? schedule.siteId,
      workDate: schedule.workDate,
      required,
      remaining,
      shortage: Math.max(0, required - remaining),
    });
  }
  return { impacts };
}

export async function submitLeaveRequest(
  actor: ActorContext,
  input: {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    siteId?: string | null;
    reason?: string | null;
    urgentReason?: string | null;
    hospitalized?: boolean;
    bereavementRelation?: BereavementRelation | null;
    officialBasis?: string | null;
    days?: number;
  },
): Promise<LeaveRequest> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.request');
  if (!actor.userId) throw new Error('缺少操作者');
  const user = await requireUserInTenant(actor.userId, tenantId);
  const policy = await requireLeavePolicy(tenantId);
  await refreshLeaveBalances(tenantId, user.id);
  const days = input.days ?? inclusiveDayCount(input.startDate, input.endDate);
  if (days <= 0) throw new Error('請假天數不正確');

  let status: LeaveRequest['status'] = LEAVE_STATUSES.PENDING;
  let isUrgent = false;
  let documentStatus = 'not_required_yet';
  let documentDueAt: string | null = null;
  let managerInterviewRequired = false;

  if (input.leaveType === LEAVE_TYPES.PREFERRED_DAY_OFF) {
    if (input.startDate !== input.endDate) {
      throw new Error('指定休每次僅能申請一日');
    }
    const month = yearMonthOf(input.startDate);
    const existing = await listPreferredDaysOff(tenantId, user.id, month);
    const counted = existing.filter((item) => item.status === 'pending' || item.status === 'approved');
    if (counted.length >= policy.preferredDayOffMonthlyLimit) {
      throw new Error(`本月指定休已達 ${policy.preferredDayOffMonthlyLimit} 日上限，請改用其他假別`);
    }
  }

  if (input.leaveType === LEAVE_TYPES.ANNUAL_LEAVE) {
    const period = periodForYear(new Date(input.startDate));
    const balance = await getLeaveBalance(tenantId, user.id, LEAVE_TYPES.ANNUAL_LEAVE, period.start);
    if (!balance || balance.remainingDays < days) {
      throw new Error('特休餘額不足，無法送出超過餘額的申請');
    }
    const start = parseDateOnly(input.startDate);
    const advance = start ? Math.round((start.getTime() - Date.now()) / 86400000) : 0;
    if (advance < policy.annualLeaveRecommendedAdvanceDays) {
      isUrgent = true;
    }
    await adjustBalance(tenantId, user.id, LEAVE_TYPES.ANNUAL_LEAVE, { pending: days }, new Date(input.startDate));
  }

  if (input.leaveType === LEAVE_TYPES.PERSONAL_LEAVE) {
    const period = periodForYear(new Date(input.startDate));
    const balance = await getLeaveBalance(tenantId, user.id, LEAVE_TYPES.PERSONAL_LEAVE, period.start);
    if (!balance || balance.remainingDays < days) {
      throw new Error('事假年度餘額不足');
    }
    const start = parseDateOnly(input.startDate);
    const advance = start ? Math.round((start.getTime() - Date.now()) / 86400000) : 0;
    if (advance < policy.personalLeaveRecommendedAdvanceDays) {
      isUrgent = true;
      if (!input.urgentReason?.trim()) {
        throw new Error('急件事假必須填寫未提前申請原因');
      }
    }
    const month = yearMonthOf(input.startDate);
    const monthRequests = (await listLeaveRequestsForUser(tenantId, user.id)).filter(
      (item) =>
        item.leaveType === LEAVE_TYPES.PERSONAL_LEAVE &&
        (ACTIVE_COUNT_STATUSES as Set<string>).has(item.status) &&
        yearMonthOf(item.startDate) === month,
    );
    const usedThisMonth = monthRequests.reduce((sum, item) => sum + item.days, 0);
    if (usedThisMonth + days > policy.personalLeaveMonthlyInterviewThreshold) {
      managerInterviewRequired = true;
      status = LEAVE_STATUSES.INTERVIEW_REQUIRED;
    }
    await adjustBalance(tenantId, user.id, LEAVE_TYPES.PERSONAL_LEAVE, { pending: days }, new Date(input.startDate));
  }

  if (input.leaveType === LEAVE_TYPES.SICK_LEAVE) {
    documentStatus = 'pending_document';
    status = LEAVE_STATUSES.DOCUMENT_PENDING;
    const due = new Date();
    due.setHours(due.getHours() + policy.sickLeaveDocumentDueHours);
    documentDueAt = due.toISOString();
  }

  if (input.leaveType === LEAVE_TYPES.BEREAVEMENT_LEAVE) {
    if (!input.bereavementRelation) {
      throw new Error('喪假必須選擇與亡者關係');
    }
    const max = taiwanLeavePolicy.bereavementEntitlementDays(input.bereavementRelation);
    if (days > max) {
      throw new Error(`依法可請 ${max} 日，本次申請不可超過`);
    }
    documentStatus = 'pending_document';
  }

  if (input.leaveType === LEAVE_TYPES.OFFICIAL_LEAVE && !input.officialBasis?.trim() && !input.reason?.trim()) {
    throw new Error('公假需填寫原因或依據');
  }

  const request = await insertLeaveRequest({
    tenantId,
    siteId: input.siteId ?? null,
    userId: user.id,
    leaveType: input.leaveType,
    status,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    reason: input.reason ?? null,
    isUrgent,
    urgentReason: input.urgentReason ?? null,
    hospitalized: input.hospitalized,
    bereavementRelation: input.bereavementRelation ?? null,
    officialBasis: input.officialBasis ?? null,
    documentStatus,
    documentDueAt,
    managerInterviewRequired,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });

  if (input.leaveType === LEAVE_TYPES.PREFERRED_DAY_OFF) {
    await insertPreferredDayOff({
      tenantId,
      userId: user.id,
      leaveRequestId: request.id,
      offDate: input.startDate,
      yearMonth: yearMonthOf(input.startDate),
      status: 'pending',
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  }

  await insertLeaveHistory({
    tenantId,
    leaveRequestId: request.id,
    action: 'submit',
    actorUserId: actor.userId,
    note: input.reason ?? null,
  });
  if (input.leaveType === LEAVE_TYPES.SICK_LEAVE && documentDueAt) {
    await insertLeaveHistory({
      tenantId,
      leaveRequestId: request.id,
      action: 'document_deadline',
      actorUserId: actor.userId,
      note: `系統建立 ${policy.sickLeaveDocumentDueHours} 小時補件期限`,
    });
  }

  const at = formatDateTimeZh(nowIso());
  await writeAudit({
    actor,
    action: 'create',
    module: 'leave',
    description: `${actor.fullName} 於 ${at} 提出${input.leaveType}申請（${input.startDate}～${input.endDate}）`,
    targetType: 'leave_request',
    targetId: request.id,
    targetDisplayName: user.fullName,
    after: request,
  });
  await notifyApprovers(tenantId, `${user.fullName} 提出新的請假申請`, `${user.fullName} 申請 ${input.startDate}～${input.endDate}`, 'leave.submitted', request.id);
  return request;
}

export async function attachLeaveFile(
  actor: ActorContext,
  leaveRequestId: string,
  file: { fileName: string; mimeType: string; localUri: string; kind: string },
): Promise<LeaveRequestAttachment> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.attachment.upload');
  const request = await getLeaveRequestById(leaveRequestId, tenantId);
  if (!request) {
    const existing = await getLeaveRequestById(leaveRequestId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到請假申請');
  }
  if (request.userId !== actor.userId) {
    const keys = await actorPermissionKeys(actor);
    if (!keys.includes('leave.approve')) {
      throw new Error('只能為自己的假單上傳附件');
    }
  }
  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
  const mime = file.mimeType.toLowerCase();
  const okExt = /\.(pdf|jpe?g|png|heic|heif)$/i.test(file.fileName);
  if (!allowed.includes(mime) && !okExt) {
    throw new Error('附件僅支援 PDF、JPG、JPEG、PNG、HEIC');
  }
  const attachment = await insertLeaveAttachment({
    tenantId,
    leaveRequestId: request.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    localUri: file.localUri,
    kind: file.kind,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  if (request.documentStatus === 'pending_document' || request.documentStatus === 'overdue' || request.documentStatus === 'rejected') {
    await updateLeaveRequest(request.id, tenantId, {
      documentStatus: 'submitted',
      status: request.status === LEAVE_STATUSES.DOCUMENT_OVERDUE ? LEAVE_STATUSES.DOCUMENT_PENDING : request.status,
    });
  }
  await insertLeaveHistory({
    tenantId,
    leaveRequestId: request.id,
    action: 'upload_attachment',
    actorUserId: actor.userId,
    note: file.fileName,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'leave',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 上傳假勤附件「${file.fileName}」`,
    targetType: 'leave_attachment',
    targetId: attachment.id,
    targetDisplayName: file.fileName,
  });
  return attachment;
}

export async function getLeaveAttachmentForViewer(actor: ActorContext, attachmentId: string) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.attachment.view');
  const attachment = await getLeaveAttachmentById(attachmentId, tenantId);
  if (!attachment) {
    const existing = await getLeaveAttachmentById(attachmentId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到附件');
  }
  return attachment;
}

export async function refreshSickLeaveOverdue(tenantId: string, at: Date = new Date()) {
  const users = await listUsersByTenant(tenantId);
  for (const user of users) {
    const requests = await listLeaveRequestsForUser(tenantId, user.id);
    for (const request of requests) {
      if (request.leaveType !== LEAVE_TYPES.SICK_LEAVE) continue;
      if (request.documentStatus !== 'pending_document') continue;
      if (!request.documentDueAt) continue;
      if (new Date(request.documentDueAt).getTime() > at.getTime()) continue;
      await updateLeaveRequest(request.id, tenantId, {
        status: LEAVE_STATUSES.DOCUMENT_OVERDUE,
        documentStatus: 'overdue',
      });
      await insertLeaveHistory({
        tenantId,
        leaveRequestId: request.id,
        action: 'document_overdue',
        actorUserId: null,
        note: '病假證明逾期未補，待主管認定。系統不會自動改為曠職。',
      });
      await notify(tenantId, user.id, '病假證明尚未補件', '病假證明逾期未補，待主管認定', 'leave.document_overdue', request.id);
      await notifyApprovers(tenantId, '病假證明逾期未補', `${user.fullName} 的病假證明已逾期`, 'leave.document_overdue', request.id);
    }
  }
}

export async function recordLeaveInterview(
  actor: ActorContext,
  leaveRequestId: string,
  input: { content: string; result: string; interviewedAt?: string },
) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.interview.record');
  const request = await getLeaveRequestById(leaveRequestId, tenantId);
  if (!request) throw new Error('找不到請假申請');
  if (!input.content.trim()) throw new Error('請填寫面談內容');
  const interview = await insertLeaveInterview({
    tenantId,
    leaveRequestId,
    interviewerUserId: actor.userId ?? '',
    interviewedAt: input.interviewedAt ?? nowIso(),
    content: input.content,
    result: input.result,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await updateLeaveRequest(leaveRequestId, tenantId, {
    status: LEAVE_STATUSES.PENDING,
    managerInterviewRequired: true,
  });
  await insertLeaveHistory({
    tenantId,
    leaveRequestId,
    action: 'interview',
    actorUserId: actor.userId,
    note: input.content,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'leave',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 完成事假面談紀錄`,
    targetType: 'leave_request',
    targetId: request.id,
  });
  return interview;
}

export async function reviewLeaveRequest(
  actor: ActorContext,
  leaveRequestId: string,
  decision: 'approved' | 'rejected' | 'returned',
  input?: { note?: string | null; approvedDays?: number },
): Promise<LeaveRequest> {
  const tenantId = requireActorTenant(actor);
  const perm = decision === 'approved' ? 'leave.approve' : decision === 'rejected' ? 'leave.reject' : 'leave.return';
  await requireActorPermission(actor, perm);
  const request = await getLeaveRequestById(leaveRequestId, tenantId);
  if (!request) {
    const existing = await getLeaveRequestById(leaveRequestId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到請假申請');
  }
  if (request.userId === actor.userId) {
    throw new Error('申請人不能自行核准請假');
  }
  if (decision === 'rejected' && !input?.note?.trim()) {
    throw new Error('拒絕必須填寫原因');
  }
  if (decision === 'returned' && !input?.note?.trim()) {
    throw new Error('退回補件必須填寫原因');
  }
  if (request.managerInterviewRequired && decision === 'approved') {
    const interviews = await listLeaveInterviews(tenantId, request.id);
    if (interviews.length === 0) {
      throw new Error('需先完成主管面談紀錄才能核准');
    }
  }
  if (request.leaveType === LEAVE_TYPES.ANNUAL_LEAVE && decision === 'approved') {
    const period = periodForYear(new Date(request.startDate));
    const balance = await getLeaveBalance(tenantId, request.userId, LEAVE_TYPES.ANNUAL_LEAVE, period.start);
    const days = input?.approvedDays ?? request.days;
    if (!balance || balance.remainingDays + balance.pendingDays < days) {
      throw new Error('特休餘額不足，不能核准超過餘額');
    }
  }
  if (request.leaveType === LEAVE_TYPES.BEREAVEMENT_LEAVE && decision === 'approved' && request.bereavementRelation) {
    const max = taiwanLeavePolicy.bereavementEntitlementDays(request.bereavementRelation);
    const days = input?.approvedDays ?? request.days;
    if (days < max && !input?.note?.trim()) {
      throw new Error('核准天數少於依法可請日數時必須填寫原因');
    }
  }

  let nextStatus: LeaveRequest['status'] =
    decision === 'approved' ? LEAVE_STATUSES.APPROVED : decision === 'rejected' ? LEAVE_STATUSES.REJECTED : LEAVE_STATUSES.RETURNED;
  if (decision === 'returned') {
    nextStatus = LEAVE_STATUSES.RETURNED;
  }
  const approvedDays = input?.approvedDays ?? request.days;
  const updated = await updateLeaveRequest(request.id, tenantId, {
    status: nextStatus,
    days: approvedDays,
  });

  if (request.leaveType === LEAVE_TYPES.PREFERRED_DAY_OFF) {
    await updatePreferredDayOffStatus(request.id, tenantId, decision === 'approved' ? 'approved' : 'rejected');
  }
  if (request.leaveType === LEAVE_TYPES.ANNUAL_LEAVE || request.leaveType === LEAVE_TYPES.PERSONAL_LEAVE) {
    await adjustBalance(
      tenantId,
      request.userId,
      request.leaveType,
      {
        pending: -request.days,
        used: decision === 'approved' ? approvedDays : 0,
      },
      new Date(request.startDate),
    );
  }

  if (decision === 'approved') {
    const schedules = await affectedSchedulesForLeave(tenantId, request.userId, request.startDate, request.endDate);
    for (const schedule of schedules) {
      await updateWorkSchedule(schedule.id, tenantId, { leaveStatus: 'leave_approved' });
      await insertScheduleLeaveLink({ tenantId, scheduleId: schedule.id, leaveRequestId: request.id });
    }
    const impact = await staffingImpactIfApproved(updated);
    const shortage = impact.impacts.find((item) => item.shortage > 0);
    if (shortage) {
      await notifyApprovers(
        tenantId,
        `核准後${shortage.workDate}將缺員${shortage.shortage}人`,
        `${shortage.siteName} ${shortage.workDate} 核准請假後缺員 ${shortage.shortage} 人`,
        'leave.staffing',
        request.id,
      );
    }
  }

  await insertLeaveHistory({
    tenantId,
    leaveRequestId: request.id,
    action: decision,
    actorUserId: actor.userId,
    note: input?.note ?? null,
  });
  const applicant = await getUserById(request.userId, tenantId);
  const verb = decision === 'approved' ? '核准' : decision === 'rejected' ? '拒絕' : '退回補件';
  await writeAudit({
    actor,
    action: decision === 'approved' ? 'approve' : 'update',
    module: 'leave',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${verb}「${applicant?.fullName ?? request.userId}」的請假申請${input?.note ? `，原因：${input.note}` : ''}`,
    targetType: 'leave_request',
    targetId: request.id,
    targetDisplayName: applicant?.fullName ?? request.id,
    after: updated,
  });
  if (applicant) {
    await notify(
      tenantId,
      applicant.id,
      decision === 'approved' ? '您的請假已核准' : decision === 'rejected' ? '您的請假已被拒絕' : '您的請假被退回補件',
      input?.note ?? '',
      `leave.${decision}`,
      request.id,
    );
  }
  return updated;
}

export async function verifyLeaveDocument(actor: ActorContext, leaveRequestId: string, accept: boolean, note?: string) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, accept ? 'leave.approve' : 'leave.return');
  const request = await getLeaveRequestById(leaveRequestId, tenantId);
  if (!request) throw new Error('找不到請假申請');
  if (!accept && !note?.trim()) throw new Error('退回證明必須填寫原因');
  const updated = await updateLeaveRequest(leaveRequestId, tenantId, {
    documentStatus: accept ? 'verified' : 'rejected',
    status: accept ? LEAVE_STATUSES.PENDING : LEAVE_STATUSES.RETURNED,
  });
  await insertLeaveHistory({
    tenantId,
    leaveRequestId,
    action: accept ? 'verify_document' : 'reject_document',
    actorUserId: actor.userId,
    note: note ?? null,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'leave',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${accept ? '確認證明文件' : `退回證明文件，原因：${note}`}`,
    targetType: 'leave_request',
    targetId: request.id,
  });
  return updated;
}

export async function listOwnLeave(actor: ActorContext) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.viewOwn');
  if (!actor.userId) throw new Error('缺少操作者');
  await refreshSickLeaveOverdue(tenantId);
  return listLeaveRequestsForUser(tenantId, actor.userId);
}

export async function listLeaveForReview(actor: ActorContext) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.view');
  await refreshSickLeaveOverdue(tenantId);
  return listLeaveRequestsForReview(tenantId);
}

export async function getLeaveDetail(actor: ActorContext, leaveRequestId: string) {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  const request = await getLeaveRequestById(leaveRequestId, tenantId);
  if (!request) {
    const existing = await getLeaveRequestById(leaveRequestId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到請假申請');
  }
  if (request.userId !== actor.userId && !keys.includes('leave.view')) {
    throw new Error('沒有此操作權限');
  }
  const attachments = keys.includes('leave.attachment.view') || request.userId === actor.userId
    ? await listLeaveAttachments(tenantId, request.id)
    : [];
  const history = await listLeaveHistory(tenantId, request.id);
  const interviews = await listLeaveInterviews(tenantId, request.id);
  const schedules = await affectedSchedulesForLeave(tenantId, request.userId, request.startDate, request.endDate);
  const impact = await staffingImpactIfApproved(request);
  return { request, attachments, history, interviews, schedules, impact };
}

export async function saveLeavePolicy(actor: ActorContext, patch: Partial<LeavePolicy>) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.policy.manage');
  const after = await updateLeavePolicy(tenantId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'leave',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 更新假勤政策`,
    targetType: 'leave_policy',
    targetId: after.id,
    after,
  });
  return after;
}

export { ensureLeavePolicy, listLeaveHistory, getLeaveRequestById };
