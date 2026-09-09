import type { BereavementRelation, LeaveStatus, LeaveType } from '@/constants/leave';
import { getDatabase } from '@/database/runtime';
import type {
  LeaveBalance,
  LeaveInterview,
  LeavePolicy,
  LeaveRequest,
  LeaveRequestAttachment,
  LeaveReviewHistory,
  PreferredDayOff,
} from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

async function tableExists(name: string): Promise<boolean> {
  const row = await getDatabase().getFirst<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [name],
  );
  return Boolean(row);
}

interface PolicyRow extends SyncRow {
  id: string;
  tenant_id: string;
  jurisdiction_code: string;
  annual_leave_recommended_advance_days: number;
  personal_leave_recommended_advance_days: number;
  sick_leave_document_due_hours: number;
  preferred_day_off_monthly_limit: number;
  personal_leave_monthly_interview_threshold: number;
  personal_leave_annual_max_days: number;
}

interface BalanceRow extends SyncRow {
  id: string;
  tenant_id: string;
  user_id: string;
  leave_type: string;
  entitlement_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
  period_start: string;
  period_end: string;
  carryover_days: number;
}

interface RequestRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  user_id: string;
  leave_type: LeaveType;
  status: LeaveStatus;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  is_urgent: number;
  urgent_reason: string | null;
  hospitalized: number;
  bereavement_relation: string | null;
  official_basis: string | null;
  document_status: string;
  document_due_at: string | null;
  manager_interview_required: number;
}

interface AttachmentRow extends SyncRow {
  id: string;
  tenant_id: string;
  leave_request_id: string;
  file_name: string;
  mime_type: string;
  local_uri: string;
  kind: string;
}

interface HistoryRow {
  id: string;
  tenant_id: string;
  leave_request_id: string;
  action: string;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
}

interface InterviewRow extends SyncRow {
  id: string;
  tenant_id: string;
  leave_request_id: string;
  interviewer_user_id: string;
  interviewed_at: string;
  content: string;
  result: string;
}

interface PreferredRow extends SyncRow {
  id: string;
  tenant_id: string;
  user_id: string;
  leave_request_id: string;
  off_date: string;
  year_month: string;
  status: PreferredDayOff['status'];
}

function mapPolicy(row: PolicyRow): LeavePolicy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jurisdictionCode: row.jurisdiction_code,
    annualLeaveRecommendedAdvanceDays: row.annual_leave_recommended_advance_days,
    personalLeaveRecommendedAdvanceDays: row.personal_leave_recommended_advance_days,
    sickLeaveDocumentDueHours: row.sick_leave_document_due_hours,
    preferredDayOffMonthlyLimit: row.preferred_day_off_monthly_limit,
    personalLeaveMonthlyInterviewThreshold: row.personal_leave_monthly_interview_threshold,
    personalLeaveAnnualMaxDays: row.personal_leave_annual_max_days,
    ...mapSync(row),
  };
}

function mapBalance(row: BalanceRow): LeaveBalance {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    leaveType: row.leave_type,
    entitlementDays: row.entitlement_days,
    usedDays: row.used_days,
    pendingDays: row.pending_days,
    remainingDays: row.remaining_days,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    carryoverDays: row.carryover_days,
    ...mapSync(row),
  };
}

function mapRequest(row: RequestRow): LeaveRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    userId: row.user_id,
    leaveType: row.leave_type,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    days: row.days,
    reason: row.reason,
    isUrgent: boolFromSql(row.is_urgent),
    urgentReason: row.urgent_reason,
    hospitalized: boolFromSql(row.hospitalized),
    bereavementRelation: (row.bereavement_relation as BereavementRelation | null) ?? null,
    officialBasis: row.official_basis,
    documentStatus: row.document_status,
    documentDueAt: row.document_due_at,
    managerInterviewRequired: boolFromSql(row.manager_interview_required),
    ...mapSync(row),
  };
}

function mapAttachment(row: AttachmentRow): LeaveRequestAttachment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leaveRequestId: row.leave_request_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    localUri: row.local_uri,
    kind: row.kind,
    ...mapSync(row),
  };
}

function mapHistory(row: HistoryRow): LeaveReviewHistory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leaveRequestId: row.leave_request_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapInterview(row: InterviewRow): LeaveInterview {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leaveRequestId: row.leave_request_id,
    interviewerUserId: row.interviewer_user_id,
    interviewedAt: row.interviewed_at,
    content: row.content,
    result: row.result,
    ...mapSync(row),
  };
}

function mapPreferred(row: PreferredRow): PreferredDayOff {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    leaveRequestId: row.leave_request_id,
    offDate: row.off_date,
    yearMonth: row.year_month,
    status: row.status,
    ...mapSync(row),
  };
}

export async function ensureLeavePolicy(tenantId: string): Promise<LeavePolicy | null> {
  if (!(await tableExists('leave_policies'))) {
    return null;
  }
  const existing = await getLeavePolicy(tenantId);
  if (existing) return existing;
  const ts = nowIso();
  await getDatabase().run(
    `INSERT OR IGNORE INTO leave_policies (
      id, tenant_id, jurisdiction_code, annual_leave_recommended_advance_days,
      personal_leave_recommended_advance_days, sick_leave_document_due_hours,
      preferred_day_off_monthly_limit, personal_leave_monthly_interview_threshold,
      personal_leave_annual_max_days, created_at, updated_at, version, sync_status
    ) VALUES (?, ?, 'TW', 30, 30, 72, 2, 3, 14, ?, ?, 1, 'local')`,
    [`lp-${tenantId}`, tenantId, ts, ts],
  );
  const created = await getLeavePolicy(tenantId);
  if (!created) throw new Error('建立假勤政策失敗');
  return created;
}

export async function requireLeavePolicy(tenantId: string): Promise<LeavePolicy> {
  const policy = await ensureLeavePolicy(tenantId);
  if (!policy) {
    throw new Error('假勤政策尚未就緒');
  }
  return policy;
}

export async function getLeavePolicy(tenantId: string): Promise<LeavePolicy | null> {
  const row = await getDatabase().getFirst<PolicyRow>(
    `SELECT * FROM leave_policies WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tenantId],
  );
  return row ? mapPolicy(row) : null;
}

export async function updateLeavePolicy(
  tenantId: string,
  patch: Partial<Omit<LeavePolicy, keyof import('@/types').SyncMeta | 'id' | 'tenantId'>>,
): Promise<LeavePolicy> {
  const current = await ensureLeavePolicy(tenantId);
  if (!current) {
    throw new Error('假勤政策資料表尚未建立');
  }
  await getDatabase().run(
    `UPDATE leave_policies SET
      jurisdiction_code = ?, annual_leave_recommended_advance_days = ?,
      personal_leave_recommended_advance_days = ?, sick_leave_document_due_hours = ?,
      preferred_day_off_monthly_limit = ?, personal_leave_monthly_interview_threshold = ?,
      personal_leave_annual_max_days = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.jurisdictionCode ?? current.jurisdictionCode,
      patch.annualLeaveRecommendedAdvanceDays ?? current.annualLeaveRecommendedAdvanceDays,
      patch.personalLeaveRecommendedAdvanceDays ?? current.personalLeaveRecommendedAdvanceDays,
      patch.sickLeaveDocumentDueHours ?? current.sickLeaveDocumentDueHours,
      patch.preferredDayOffMonthlyLimit ?? current.preferredDayOffMonthlyLimit,
      patch.personalLeaveMonthlyInterviewThreshold ?? current.personalLeaveMonthlyInterviewThreshold,
      patch.personalLeaveAnnualMaxDays ?? current.personalLeaveAnnualMaxDays,
      nowIso(),
      current.id,
      tenantId,
    ],
  );
  const updated = await getLeavePolicy(tenantId);
  if (!updated) throw new Error('更新假勤政策失敗');
  return updated;
}

export async function getLeaveBalance(
  tenantId: string,
  userId: string,
  leaveType: string,
  periodStart: string,
): Promise<LeaveBalance | null> {
  const row = await getDatabase().getFirst<BalanceRow>(
    `SELECT * FROM leave_balances
     WHERE tenant_id = ? AND user_id = ? AND leave_type = ? AND period_start = ? AND deleted_at IS NULL`,
    [tenantId, userId, leaveType, periodStart],
  );
  return row ? mapBalance(row) : null;
}

export async function upsertLeaveBalance(input: {
  tenantId: string;
  userId: string;
  leaveType: string;
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  periodStart: string;
  periodEnd: string;
  carryoverDays: number;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<LeaveBalance> {
  const existing = await getLeaveBalance(input.tenantId, input.userId, input.leaveType, input.periodStart);
  const ts = nowIso();
  if (existing) {
    await getDatabase().run(
      `UPDATE leave_balances SET
        entitlement_days = ?, used_days = ?, pending_days = ?, remaining_days = ?,
        period_end = ?, carryover_days = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ? AND tenant_id = ?`,
      [
        input.entitlementDays,
        input.usedDays,
        input.pendingDays,
        input.remainingDays,
        input.periodEnd,
        input.carryoverDays,
        ts,
        existing.id,
        input.tenantId,
      ],
    );
    const updated = await getLeaveBalance(input.tenantId, input.userId, input.leaveType, input.periodStart);
    if (!updated) throw new Error('更新假期餘額失敗');
    return updated;
  }
  const id = createId();
  await getDatabase().run(
    `INSERT INTO leave_balances (
      id, tenant_id, user_id, leave_type, entitlement_days, used_days, pending_days, remaining_days,
      period_start, period_end, carryover_days, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.userId,
      input.leaveType,
      input.entitlementDays,
      input.usedDays,
      input.pendingDays,
      input.remainingDays,
      input.periodStart,
      input.periodEnd,
      input.carryoverDays,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getLeaveBalance(input.tenantId, input.userId, input.leaveType, input.periodStart);
  if (!created) throw new Error('建立假期餘額失敗');
  return created;
}

export async function insertLeaveRequest(input: {
  tenantId: string;
  siteId?: string | null;
  userId: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  isUrgent?: boolean;
  urgentReason?: string | null;
  hospitalized?: boolean;
  bereavementRelation?: string | null;
  officialBasis?: string | null;
  documentStatus?: string;
  documentDueAt?: string | null;
  managerInterviewRequired?: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<LeaveRequest> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO leave_requests (
      id, tenant_id, site_id, user_id, leave_type, status, start_date, end_date, days, reason,
      is_urgent, urgent_reason, hospitalized, bereavement_relation, official_basis,
      document_status, document_due_at, manager_interview_required,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId ?? null,
      input.userId,
      input.leaveType,
      input.status,
      input.startDate,
      input.endDate,
      input.days,
      input.reason ?? null,
      sqlBool(input.isUrgent ?? false),
      input.urgentReason ?? null,
      sqlBool(input.hospitalized ?? false),
      input.bereavementRelation ?? null,
      input.officialBasis ?? null,
      input.documentStatus ?? 'not_required_yet',
      input.documentDueAt ?? null,
      sqlBool(input.managerInterviewRequired ?? false),
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getLeaveRequestById(id, input.tenantId);
  if (!created) throw new Error('建立請假申請失敗');
  return created;
}

export async function getLeaveRequestById(id: string, tenantId?: string | null): Promise<LeaveRequest | null> {
  const row = tenantId
    ? await getDatabase().getFirst<RequestRow>(
        'SELECT * FROM leave_requests WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<RequestRow>(
        'SELECT * FROM leave_requests WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapRequest(row) : null;
}

export async function listLeaveRequestsForUser(tenantId: string, userId: string): Promise<LeaveRequest[]> {
  const rows = await getDatabase().getAll<RequestRow>(
    `SELECT * FROM leave_requests WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId, userId],
  );
  return rows.map(mapRequest);
}

export async function listLeaveRequestsForReview(tenantId: string): Promise<LeaveRequest[]> {
  const rows = await getDatabase().getAll<RequestRow>(
    `SELECT * FROM leave_requests
     WHERE tenant_id = ? AND deleted_at IS NULL
       AND status IN ('pending', 'submitted', 'document_pending', 'document_overdue', 'interview_required', 'returned')
     ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows.map(mapRequest);
}

export async function listLeaveRequestsOverlapping(
  tenantId: string,
  userId: string,
  startDate: string,
  endDate: string,
  types?: string[],
): Promise<LeaveRequest[]> {
  const rows = await getDatabase().getAll<RequestRow>(
    `SELECT * FROM leave_requests
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
       AND start_date <= ? AND end_date >= ?`,
    [tenantId, userId, endDate, startDate],
  );
  const mapped = rows.map(mapRequest);
  if (!types) return mapped;
  return mapped.filter((item) => types.includes(item.leaveType));
}

export async function updateLeaveRequest(
  id: string,
  tenantId: string,
  patch: Partial<{
    status: LeaveStatus;
    days: number;
    reason: string | null;
    isUrgent: boolean;
    urgentReason: string | null;
    documentStatus: string;
    documentDueAt: string | null;
    managerInterviewRequired: boolean;
  }>,
): Promise<LeaveRequest> {
  const current = await getLeaveRequestById(id, tenantId);
  if (!current) throw new Error('找不到請假申請');
  await getDatabase().run(
    `UPDATE leave_requests SET
      status = ?, days = ?, reason = ?, is_urgent = ?, urgent_reason = ?,
      document_status = ?, document_due_at = ?, manager_interview_required = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.status ?? current.status,
      patch.days ?? current.days,
      patch.reason === undefined ? current.reason : patch.reason,
      sqlBool(patch.isUrgent ?? current.isUrgent),
      patch.urgentReason === undefined ? current.urgentReason : patch.urgentReason,
      patch.documentStatus ?? current.documentStatus,
      patch.documentDueAt === undefined ? current.documentDueAt : patch.documentDueAt,
      sqlBool(patch.managerInterviewRequired ?? current.managerInterviewRequired),
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getLeaveRequestById(id, tenantId);
  if (!updated) throw new Error('更新請假申請失敗');
  return updated;
}

export async function insertLeaveAttachment(input: {
  tenantId: string;
  leaveRequestId: string;
  fileName: string;
  mimeType: string;
  localUri: string;
  kind: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<LeaveRequestAttachment> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO leave_request_attachments (
      id, tenant_id, leave_request_id, file_name, mime_type, local_uri, kind,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.leaveRequestId,
      input.fileName,
      input.mimeType,
      input.localUri,
      input.kind,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getLeaveAttachmentById(id, input.tenantId);
  if (!created) throw new Error('建立附件失敗');
  return created;
}

export async function getLeaveAttachmentById(
  id: string,
  tenantId?: string | null,
): Promise<LeaveRequestAttachment | null> {
  const row = tenantId
    ? await getDatabase().getFirst<AttachmentRow>(
        'SELECT * FROM leave_request_attachments WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<AttachmentRow>(
        'SELECT * FROM leave_request_attachments WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapAttachment(row) : null;
}

export async function listLeaveAttachments(
  tenantId: string,
  leaveRequestId: string,
): Promise<LeaveRequestAttachment[]> {
  const rows = await getDatabase().getAll<AttachmentRow>(
    `SELECT * FROM leave_request_attachments
     WHERE tenant_id = ? AND leave_request_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [tenantId, leaveRequestId],
  );
  return rows.map(mapAttachment);
}

export async function softDeleteLeaveAttachment(id: string, tenantId: string): Promise<void> {
  await getDatabase().run(
    `UPDATE leave_request_attachments SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [nowIso(), nowIso(), id, tenantId],
  );
}

export async function insertLeaveHistory(input: {
  tenantId: string;
  leaveRequestId: string;
  action: string;
  actorUserId: string | null;
  note?: string | null;
}): Promise<LeaveReviewHistory> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO leave_review_history (id, tenant_id, leave_request_id, action, actor_user_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.tenantId, input.leaveRequestId, input.action, input.actorUserId, input.note ?? null, ts],
  );
  return {
    id,
    tenantId: input.tenantId,
    leaveRequestId: input.leaveRequestId,
    action: input.action,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
    createdAt: ts,
  };
}

export async function listLeaveHistory(tenantId: string, leaveRequestId: string): Promise<LeaveReviewHistory[]> {
  const rows = await getDatabase().getAll<HistoryRow>(
    `SELECT * FROM leave_review_history WHERE tenant_id = ? AND leave_request_id = ? ORDER BY created_at ASC`,
    [tenantId, leaveRequestId],
  );
  return rows.map(mapHistory);
}

export async function insertLeaveInterview(input: {
  tenantId: string;
  leaveRequestId: string;
  interviewerUserId: string;
  interviewedAt: string;
  content: string;
  result: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<LeaveInterview> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO leave_interviews (
      id, tenant_id, leave_request_id, interviewer_user_id, interviewed_at, content, result,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.leaveRequestId,
      input.interviewerUserId,
      input.interviewedAt,
      input.content,
      input.result,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<InterviewRow>(
    'SELECT * FROM leave_interviews WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('建立面談紀錄失敗');
  return mapInterview(row);
}

export async function listLeaveInterviews(tenantId: string, leaveRequestId: string): Promise<LeaveInterview[]> {
  const rows = await getDatabase().getAll<InterviewRow>(
    `SELECT * FROM leave_interviews WHERE tenant_id = ? AND leave_request_id = ? AND deleted_at IS NULL ORDER BY interviewed_at ASC`,
    [tenantId, leaveRequestId],
  );
  return rows.map(mapInterview);
}

export async function insertPreferredDayOff(input: {
  tenantId: string;
  userId: string;
  leaveRequestId: string;
  offDate: string;
  yearMonth: string;
  status: PreferredDayOff['status'];
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PreferredDayOff> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO preferred_days_off (
      id, tenant_id, user_id, leave_request_id, off_date, year_month, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.userId,
      input.leaveRequestId,
      input.offDate,
      input.yearMonth,
      input.status,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<PreferredRow>(
    'SELECT * FROM preferred_days_off WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('建立指定休失敗');
  return mapPreferred(row);
}

export async function listPreferredDaysOff(
  tenantId: string,
  userId: string,
  yearMonth: string,
): Promise<PreferredDayOff[]> {
  const rows = await getDatabase().getAll<PreferredRow>(
    `SELECT * FROM preferred_days_off
     WHERE tenant_id = ? AND user_id = ? AND year_month = ? AND deleted_at IS NULL
     ORDER BY off_date ASC`,
    [tenantId, userId, yearMonth],
  );
  return rows.map(mapPreferred);
}

export async function updatePreferredDayOffStatus(
  leaveRequestId: string,
  tenantId: string,
  status: PreferredDayOff['status'],
): Promise<void> {
  await getDatabase().run(
    `UPDATE preferred_days_off SET status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE leave_request_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [status, nowIso(), leaveRequestId, tenantId],
  );
}
