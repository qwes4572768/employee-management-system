import { STAFFING_MODES, type StaffingMode } from '@/constants/staffing';
import type { ScheduleStatus, ScheduleType } from '@/constants/workforce';
import { getDatabase } from '@/database/runtime';
import type { ShiftTemplate, WorkSchedule, WorkforceSettings } from '@/types';
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

interface SettingsRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  minimum_rest_minutes: number;
  late_grace_minutes: number;
  early_leave_grace_minutes: number;
  weekly_rest_mode: string;
  jurisdiction_code: string;
}

interface TemplateRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  crosses_midnight: number;
  planned_minutes: number;
  status: 'active' | 'inactive';
  starts_at: string | null;
  expires_at: string | null;
}

interface ScheduleRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  user_id: string;
  shift_template_id: string | null;
  work_date: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  schedule_type: ScheduleType;
  staffing_mode_snapshot: StaffingMode;
  allow_training_overlap: number;
  trainer_user_id: string | null;
  training_reason: string | null;
  status: ScheduleStatus;
  leave_status: 'none' | 'leave_approved';
  weekly_rest_warning: number;
  note: string | null;
  override_reason: string | null;
}

function mapSettings(row: SettingsRow): WorkforceSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    minimumRestMinutes: row.minimum_rest_minutes,
    lateGraceMinutes: row.late_grace_minutes,
    earlyLeaveGraceMinutes: row.early_leave_grace_minutes,
    weeklyRestMode: row.weekly_rest_mode,
    jurisdictionCode: row.jurisdiction_code,
    ...mapSync(row),
  };
}

function mapTemplate(row: TemplateRow): ShiftTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    name: row.name,
    code: row.code,
    startTime: row.start_time,
    endTime: row.end_time,
    crossesMidnight: boolFromSql(row.crosses_midnight),
    plannedMinutes: row.planned_minutes,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    ...mapSync(row),
  };
}

function mapSchedule(row: ScheduleRow): WorkSchedule {
  const mode =
    row.staffing_mode_snapshot === STAFFING_MODES.MOBILE || row.staffing_mode_snapshot === STAFFING_MODES.TRAINEE
      ? row.staffing_mode_snapshot
      : STAFFING_MODES.FIXED;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    userId: row.user_id,
    shiftTemplateId: row.shift_template_id,
    workDate: row.work_date,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    scheduleType: row.schedule_type,
    staffingModeSnapshot: mode,
    allowTrainingOverlap: boolFromSql(row.allow_training_overlap),
    trainerUserId: row.trainer_user_id,
    trainingReason: row.training_reason,
    status: row.status,
    leaveStatus: row.leave_status,
    weeklyRestWarning: boolFromSql(row.weekly_rest_warning),
    note: row.note,
    overrideReason: row.override_reason,
    ...mapSync(row),
  };
}

export async function ensureTenantWorkforceDefaults(tenantId: string): Promise<WorkforceSettings | null> {
  if (!(await tableExists('workforce_settings'))) {
    return null;
  }
  const existing = await getWorkforceSettings(tenantId);
  if (existing) return existing;
  const ts = nowIso();
  await getDatabase().run(
    `INSERT OR IGNORE INTO workforce_settings (
      id, tenant_id, site_id, minimum_rest_minutes, late_grace_minutes, early_leave_grace_minutes,
      weekly_rest_mode, jurisdiction_code, created_at, updated_at, version, sync_status
    ) VALUES (?, ?, NULL, 480, 5, 5, 'standard_tw', 'TW', ?, ?, 1, 'local')`,
    [`ws-${tenantId}`, tenantId, ts, ts],
  );
  const created = await getWorkforceSettings(tenantId);
  if (!created) {
    throw new Error('建立勤務設定失敗');
  }
  return created;
}

export async function requireWorkforceSettings(tenantId: string): Promise<WorkforceSettings> {
  const settings = await ensureTenantWorkforceDefaults(tenantId);
  if (!settings) {
    throw new Error('勤務設定尚未就緒');
  }
  return settings;
}

export async function getWorkforceSettings(tenantId: string): Promise<WorkforceSettings | null> {
  const row = await getDatabase().getFirst<SettingsRow>(
    `SELECT * FROM workforce_settings WHERE tenant_id = ? AND deleted_at IS NULL AND site_id IS NULL`,
    [tenantId],
  );
  return row ? mapSettings(row) : null;
}

export async function updateWorkforceSettings(
  tenantId: string,
  patch: Partial<Pick<WorkforceSettings, 'minimumRestMinutes' | 'lateGraceMinutes' | 'earlyLeaveGraceMinutes' | 'weeklyRestMode' | 'jurisdictionCode'>>,
): Promise<WorkforceSettings> {
  const current = await ensureTenantWorkforceDefaults(tenantId);
  if (!current) {
    throw new Error('勤務設定資料表尚未建立');
  }
  await getDatabase().run(
    `UPDATE workforce_settings SET
      minimum_rest_minutes = ?, late_grace_minutes = ?, early_leave_grace_minutes = ?,
      weekly_rest_mode = ?, jurisdiction_code = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.minimumRestMinutes ?? current.minimumRestMinutes,
      patch.lateGraceMinutes ?? current.lateGraceMinutes,
      patch.earlyLeaveGraceMinutes ?? current.earlyLeaveGraceMinutes,
      patch.weeklyRestMode ?? current.weeklyRestMode,
      patch.jurisdictionCode ?? current.jurisdictionCode,
      nowIso(),
      current.id,
      tenantId,
    ],
  );
  const updated = await getWorkforceSettings(tenantId);
  if (!updated) throw new Error('更新勤務設定失敗');
  return updated;
}

export async function insertShiftTemplate(input: {
  tenantId: string;
  siteId?: string | null;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  plannedMinutes: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ShiftTemplate> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO shift_templates (
      id, tenant_id, site_id, name, code, start_time, end_time, crosses_midnight, planned_minutes,
      status, starts_at, expires_at, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId ?? null,
      input.name.trim(),
      input.code.trim(),
      input.startTime,
      input.endTime,
      sqlBool(input.crossesMidnight),
      input.plannedMinutes,
      input.startsAt ?? null,
      input.expiresAt ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getShiftTemplateById(id, input.tenantId);
  if (!created) throw new Error('建立班別失敗');
  return created;
}

export async function getShiftTemplateById(id: string, tenantId?: string | null): Promise<ShiftTemplate | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TemplateRow>(
        'SELECT * FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<TemplateRow>(
        'SELECT * FROM shift_templates WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapTemplate(row) : null;
}

export async function listShiftTemplates(tenantId: string, siteId?: string | null): Promise<ShiftTemplate[]> {
  const rows = siteId
    ? await getDatabase().getAll<TemplateRow>(
        `SELECT * FROM shift_templates
         WHERE tenant_id = ? AND deleted_at IS NULL AND (site_id IS NULL OR site_id = ?)
         ORDER BY start_time ASC, name ASC`,
        [tenantId, siteId],
      )
    : await getDatabase().getAll<TemplateRow>(
        `SELECT * FROM shift_templates WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY start_time ASC, name ASC`,
        [tenantId],
      );
  return rows.map(mapTemplate);
}

export async function updateShiftTemplate(
  id: string,
  tenantId: string,
  patch: Partial<{
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
    plannedMinutes: number;
    siteId: string | null;
    startsAt: string | null;
    expiresAt: string | null;
    status: 'active' | 'inactive';
  }>,
): Promise<ShiftTemplate> {
  const current = await getShiftTemplateById(id, tenantId);
  if (!current) throw new Error('找不到班別');
  await getDatabase().run(
    `UPDATE shift_templates SET
      name = ?, code = ?, start_time = ?, end_time = ?, crosses_midnight = ?, planned_minutes = ?,
      site_id = ?, starts_at = ?, expires_at = ?, status = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.name?.trim() ?? current.name,
      patch.code?.trim() ?? current.code,
      patch.startTime ?? current.startTime,
      patch.endTime ?? current.endTime,
      sqlBool(patch.crossesMidnight ?? current.crossesMidnight),
      patch.plannedMinutes ?? current.plannedMinutes,
      patch.siteId === undefined ? current.siteId : patch.siteId,
      patch.startsAt === undefined ? current.startsAt : patch.startsAt,
      patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt,
      patch.status ?? current.status,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getShiftTemplateById(id, tenantId);
  if (!updated) throw new Error('更新班別失敗');
  return updated;
}

export async function insertWorkSchedule(input: {
  tenantId: string;
  siteId: string;
  userId: string;
  shiftTemplateId?: string | null;
  workDate: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  scheduleType: ScheduleType;
  staffingModeSnapshot: StaffingMode;
  allowTrainingOverlap?: boolean;
  trainerUserId?: string | null;
  trainingReason?: string | null;
  weeklyRestWarning?: boolean;
  note?: string | null;
  overrideReason?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<WorkSchedule> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO work_schedules (
      id, tenant_id, site_id, user_id, shift_template_id, work_date, scheduled_start_at, scheduled_end_at,
      schedule_type, staffing_mode_snapshot, allow_training_overlap, trainer_user_id, training_reason,
      status, leave_status, weekly_rest_warning, note, override_reason,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'none', ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.userId,
      input.shiftTemplateId ?? null,
      input.workDate,
      input.scheduledStartAt,
      input.scheduledEndAt,
      input.scheduleType,
      input.staffingModeSnapshot,
      sqlBool(input.allowTrainingOverlap ?? false),
      input.trainerUserId ?? null,
      input.trainingReason ?? null,
      sqlBool(input.weeklyRestWarning ?? false),
      input.note ?? null,
      input.overrideReason ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getWorkScheduleById(id, input.tenantId);
  if (!created) throw new Error('建立排班失敗');
  return created;
}

export async function getWorkScheduleById(id: string, tenantId?: string | null): Promise<WorkSchedule | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ScheduleRow>(
        'SELECT * FROM work_schedules WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<ScheduleRow>(
        'SELECT * FROM work_schedules WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapSchedule(row) : null;
}

export async function listActiveSchedulesForUser(tenantId: string, userId: string): Promise<WorkSchedule[]> {
  const rows = await getDatabase().getAll<ScheduleRow>(
    `SELECT * FROM work_schedules
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL AND status != 'cancelled'
     ORDER BY scheduled_start_at ASC`,
    [tenantId, userId],
  );
  return rows.map(mapSchedule);
}

export async function listSchedulesForUserInRange(
  tenantId: string,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<WorkSchedule[]> {
  const rows = await getDatabase().getAll<ScheduleRow>(
    `SELECT * FROM work_schedules
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
       AND work_date >= ? AND work_date <= ?
     ORDER BY scheduled_start_at ASC`,
    [tenantId, userId, startDate, endDate],
  );
  return rows.map(mapSchedule);
}

export async function listSchedulesForSiteDate(
  tenantId: string,
  siteId: string,
  workDate: string,
): Promise<WorkSchedule[]> {
  const rows = await getDatabase().getAll<ScheduleRow>(
    `SELECT * FROM work_schedules
     WHERE tenant_id = ? AND site_id = ? AND work_date = ? AND deleted_at IS NULL
     ORDER BY scheduled_start_at ASC`,
    [tenantId, siteId, workDate],
  );
  return rows.map(mapSchedule);
}

export async function listSchedulesForSiteRange(
  tenantId: string,
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<WorkSchedule[]> {
  const rows = await getDatabase().getAll<ScheduleRow>(
    `SELECT * FROM work_schedules
     WHERE tenant_id = ? AND site_id = ? AND deleted_at IS NULL
       AND work_date >= ? AND work_date <= ?
     ORDER BY work_date ASC, scheduled_start_at ASC`,
    [tenantId, siteId, startDate, endDate],
  );
  return rows.map(mapSchedule);
}

export async function updateWorkSchedule(
  id: string,
  tenantId: string,
  patch: Partial<{
    siteId: string;
    shiftTemplateId: string | null;
    workDate: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    scheduleType: ScheduleType;
    allowTrainingOverlap: boolean;
    trainerUserId: string | null;
    trainingReason: string | null;
    status: ScheduleStatus;
    leaveStatus: 'none' | 'leave_approved';
    weeklyRestWarning: boolean;
    note: string | null;
    overrideReason: string | null;
  }>,
): Promise<WorkSchedule> {
  const current = await getWorkScheduleById(id, tenantId);
  if (!current) throw new Error('找不到排班');
  await getDatabase().run(
    `UPDATE work_schedules SET
      site_id = ?, shift_template_id = ?, work_date = ?, scheduled_start_at = ?, scheduled_end_at = ?,
      schedule_type = ?, allow_training_overlap = ?, trainer_user_id = ?, training_reason = ?,
      status = ?, leave_status = ?, weekly_rest_warning = ?, note = ?, override_reason = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.siteId ?? current.siteId,
      patch.shiftTemplateId === undefined ? current.shiftTemplateId : patch.shiftTemplateId,
      patch.workDate ?? current.workDate,
      patch.scheduledStartAt ?? current.scheduledStartAt,
      patch.scheduledEndAt ?? current.scheduledEndAt,
      patch.scheduleType ?? current.scheduleType,
      sqlBool(patch.allowTrainingOverlap ?? current.allowTrainingOverlap),
      patch.trainerUserId === undefined ? current.trainerUserId : patch.trainerUserId,
      patch.trainingReason === undefined ? current.trainingReason : patch.trainingReason,
      patch.status ?? current.status,
      patch.leaveStatus ?? current.leaveStatus,
      sqlBool(patch.weeklyRestWarning ?? current.weeklyRestWarning),
      patch.note === undefined ? current.note : patch.note,
      patch.overrideReason === undefined ? current.overrideReason : patch.overrideReason,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getWorkScheduleById(id, tenantId);
  if (!updated) throw new Error('更新排班失敗');
  return updated;
}

export async function insertScheduleLeaveLink(input: {
  tenantId: string;
  scheduleId: string;
  leaveRequestId: string;
}): Promise<void> {
  await getDatabase().run(
    `INSERT INTO schedule_leave_links (id, tenant_id, schedule_id, leave_request_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [createId(), input.tenantId, input.scheduleId, input.leaveRequestId, nowIso()],
  );
}
