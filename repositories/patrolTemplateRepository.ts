import { getDatabase } from '@/database/runtime';
import type { PatrolScheduleMode } from '@/constants/patrol';
import type { PatrolTemplate, PatrolTemplatePoint } from '@/types';
import { boolFromSql, parseJson, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface TemplateRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  description: string | null;
  shift_template_id: string | null;
  schedule_mode: string;
  schedule_weekdays: string | null;
  custom_dates: string | null;
  status: 'active' | 'inactive';
  effective_start_date: string;
  effective_end_date: string | null;
  allow_late_patrol: number;
  enforce_sequence: number;
  live_camera_only: number;
}

interface TemplatePointRow extends SyncRow {
  id: string;
  tenant_id: string;
  patrol_template_id: string;
  patrol_point_id: string;
  sequence_no: number;
  window_start_time: string;
  window_end_time: string;
  required_count: number;
  require_qr_override: number | null;
  require_gps_override: number | null;
  require_photo_override: number | null;
  grace_minutes: number;
  is_required: number;
  is_critical: number;
}

function mapTemplate(row: TemplateRow): PatrolTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    name: row.name,
    description: row.description,
    shiftTemplateId: row.shift_template_id,
    scheduleMode: row.schedule_mode as PatrolScheduleMode,
    scheduleWeekdays: parseJson<number[]>(row.schedule_weekdays),
    customDates: parseJson<string[]>(row.custom_dates),
    status: row.status,
    effectiveStartDate: row.effective_start_date,
    effectiveEndDate: row.effective_end_date,
    allowLatePatrol: boolFromSql(row.allow_late_patrol),
    enforceSequence: boolFromSql(row.enforce_sequence),
    liveCameraOnly: boolFromSql(row.live_camera_only),
    ...mapSync(row),
  };
}

function mapOverride(value: number | null): boolean | null {
  if (value == null) return null;
  return boolFromSql(value);
}

function mapTemplatePoint(row: TemplatePointRow): PatrolTemplatePoint {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patrolTemplateId: row.patrol_template_id,
    patrolPointId: row.patrol_point_id,
    sequenceNo: row.sequence_no,
    windowStartTime: row.window_start_time,
    windowEndTime: row.window_end_time,
    requiredCount: row.required_count,
    requireQrOverride: mapOverride(row.require_qr_override),
    requireGpsOverride: mapOverride(row.require_gps_override),
    requirePhotoOverride: mapOverride(row.require_photo_override),
    graceMinutes: row.grace_minutes,
    isRequired: boolFromSql(row.is_required),
    isCritical: boolFromSql(row.is_critical),
    ...mapSync(row),
  };
}

export async function insertPatrolTemplate(input: {
  tenantId: string;
  siteId: string;
  name: string;
  description?: string | null;
  shiftTemplateId?: string | null;
  scheduleMode?: PatrolScheduleMode;
  scheduleWeekdays?: number[] | null;
  customDates?: string[] | null;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  allowLatePatrol?: boolean;
  enforceSequence?: boolean;
  liveCameraOnly?: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolTemplate> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_templates (
      id, tenant_id, site_id, name, description, shift_template_id, schedule_mode,
      schedule_weekdays, custom_dates, status, effective_start_date, effective_end_date,
      allow_late_patrol, enforce_sequence, live_camera_only,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.name,
      input.description ?? null,
      input.shiftTemplateId ?? null,
      input.scheduleMode ?? 'daily',
      input.scheduleWeekdays ? JSON.stringify(input.scheduleWeekdays) : null,
      input.customDates ? JSON.stringify(input.customDates) : null,
      input.effectiveStartDate,
      input.effectiveEndDate ?? null,
      sqlBool(input.allowLatePatrol ?? false),
      sqlBool(input.enforceSequence ?? false),
      sqlBool(input.liveCameraOnly ?? true),
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolTemplateById(id, input.tenantId);
  if (!created) throw new Error('建立巡邏模板失敗');
  return created;
}

export async function getPatrolTemplateById(id: string, tenantId?: string | null): Promise<PatrolTemplate | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TemplateRow>(
        'SELECT * FROM patrol_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<TemplateRow>(
        'SELECT * FROM patrol_templates WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapTemplate(row) : null;
}

export async function listPatrolTemplates(
  tenantId: string,
  input?: { siteId?: string | null; status?: 'active' | 'inactive' | null },
): Promise<PatrolTemplate[]> {
  const rows = await getDatabase().getAll<TemplateRow>(
    `SELECT * FROM patrol_templates WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapTemplate)
    .filter((item) => (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status));
}

export async function updatePatrolTemplate(
  id: string,
  tenantId: string,
  patch: Partial<
    Pick<
      PatrolTemplate,
      | 'name'
      | 'description'
      | 'shiftTemplateId'
      | 'scheduleMode'
      | 'scheduleWeekdays'
      | 'customDates'
      | 'status'
      | 'effectiveStartDate'
      | 'effectiveEndDate'
      | 'allowLatePatrol'
      | 'enforceSequence'
      | 'liveCameraOnly'
    >
  >,
): Promise<PatrolTemplate> {
  const current = await getPatrolTemplateById(id, tenantId);
  if (!current) throw new Error('找不到巡邏模板');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE patrol_templates SET
      name = ?, description = ?, shift_template_id = ?, schedule_mode = ?,
      schedule_weekdays = ?, custom_dates = ?, status = ?,
      effective_start_date = ?, effective_end_date = ?,
      allow_late_patrol = ?, enforce_sequence = ?, live_camera_only = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      patch.name ?? current.name,
      patch.description === undefined ? current.description : patch.description,
      patch.shiftTemplateId === undefined ? current.shiftTemplateId : patch.shiftTemplateId,
      patch.scheduleMode ?? current.scheduleMode,
      (() => {
        const weekdays = patch.scheduleWeekdays === undefined ? current.scheduleWeekdays : patch.scheduleWeekdays;
        return weekdays ? JSON.stringify(weekdays) : null;
      })(),
      (() => {
        const dates = patch.customDates === undefined ? current.customDates : patch.customDates;
        return dates ? JSON.stringify(dates) : null;
      })(),
      patch.status ?? current.status,
      patch.effectiveStartDate ?? current.effectiveStartDate,
      patch.effectiveEndDate === undefined ? current.effectiveEndDate : patch.effectiveEndDate,
      sqlBool(patch.allowLatePatrol ?? current.allowLatePatrol),
      sqlBool(patch.enforceSequence ?? current.enforceSequence),
      sqlBool(patch.liveCameraOnly ?? current.liveCameraOnly),
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getPatrolTemplateById(id, tenantId);
  if (!updated) throw new Error('更新巡邏模板失敗');
  return updated;
}

export async function insertPatrolTemplatePoint(input: {
  tenantId: string;
  patrolTemplateId: string;
  patrolPointId: string;
  sequenceNo: number;
  windowStartTime: string;
  windowEndTime: string;
  requiredCount?: number;
  requireQrOverride?: boolean | null;
  requireGpsOverride?: boolean | null;
  requirePhotoOverride?: boolean | null;
  graceMinutes?: number;
  isRequired?: boolean;
  isCritical?: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolTemplatePoint> {
  const id = createId();
  const ts = nowIso();
  const override = (value: boolean | null | undefined) => (value == null ? null : sqlBool(value));
  await getDatabase().run(
    `INSERT INTO patrol_template_points (
      id, tenant_id, patrol_template_id, patrol_point_id, sequence_no,
      window_start_time, window_end_time, required_count,
      require_qr_override, require_gps_override, require_photo_override,
      grace_minutes, is_required, is_critical,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.patrolTemplateId,
      input.patrolPointId,
      input.sequenceNo,
      input.windowStartTime,
      input.windowEndTime,
      input.requiredCount ?? 1,
      override(input.requireQrOverride),
      override(input.requireGpsOverride),
      override(input.requirePhotoOverride),
      input.graceMinutes ?? 0,
      sqlBool(input.isRequired ?? true),
      sqlBool(input.isCritical ?? false),
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolTemplatePointById(id, input.tenantId);
  if (!created) throw new Error('加入巡邏點失敗');
  return created;
}

export async function getPatrolTemplatePointById(
  id: string,
  tenantId?: string | null,
): Promise<PatrolTemplatePoint | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TemplatePointRow>(
        'SELECT * FROM patrol_template_points WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<TemplatePointRow>(
        'SELECT * FROM patrol_template_points WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapTemplatePoint(row) : null;
}

export async function listPatrolTemplatePoints(
  tenantId: string,
  templateId: string,
): Promise<PatrolTemplatePoint[]> {
  const rows = await getDatabase().getAll<TemplatePointRow>(
    `SELECT * FROM patrol_template_points
     WHERE tenant_id = ? AND patrol_template_id = ? AND deleted_at IS NULL
     ORDER BY sequence_no ASC`,
    [tenantId, templateId],
  );
  return rows.map(mapTemplatePoint);
}

export async function updatePatrolTemplatePoint(
  id: string,
  tenantId: string,
  patch: Partial<
    Pick<
      PatrolTemplatePoint,
      | 'sequenceNo'
      | 'windowStartTime'
      | 'windowEndTime'
      | 'requiredCount'
      | 'requireQrOverride'
      | 'requireGpsOverride'
      | 'requirePhotoOverride'
      | 'graceMinutes'
      | 'isRequired'
      | 'isCritical'
    >
  >,
): Promise<PatrolTemplatePoint> {
  const current = await getPatrolTemplatePointById(id, tenantId);
  if (!current) throw new Error('找不到模板巡邏點');
  const ts = nowIso();
  const override = (value: boolean | null) => (value == null ? null : sqlBool(value));
  await getDatabase().run(
    `UPDATE patrol_template_points SET
      sequence_no = ?, window_start_time = ?, window_end_time = ?, required_count = ?,
      require_qr_override = ?, require_gps_override = ?, require_photo_override = ?,
      grace_minutes = ?, is_required = ?, is_critical = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      patch.sequenceNo ?? current.sequenceNo,
      patch.windowStartTime ?? current.windowStartTime,
      patch.windowEndTime ?? current.windowEndTime,
      patch.requiredCount ?? current.requiredCount,
      override(patch.requireQrOverride === undefined ? current.requireQrOverride : patch.requireQrOverride),
      override(patch.requireGpsOverride === undefined ? current.requireGpsOverride : patch.requireGpsOverride),
      override(patch.requirePhotoOverride === undefined ? current.requirePhotoOverride : patch.requirePhotoOverride),
      patch.graceMinutes ?? current.graceMinutes,
      sqlBool(patch.isRequired ?? current.isRequired),
      sqlBool(patch.isCritical ?? current.isCritical),
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getPatrolTemplatePointById(id, tenantId);
  if (!updated) throw new Error('更新模板巡邏點失敗');
  return updated;
}
