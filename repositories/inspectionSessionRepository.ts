import { getDatabase } from '@/database/runtime';
import type { InspectionSessionStatus, InspectionVerificationStatus } from '@/constants/inspection';
import type { InspectionSession } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface SessionRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  employee_user_id: string;
  inspector_user_id: string;
  employee_qr_asset_id: string | null;
  qr_scan_log_id: string | null;
  started_at: string;
  completed_at: string | null;
  inspector_latitude: number | null;
  inspector_longitude: number | null;
  inspector_distance_meters: number | null;
  remote_inspection_warning: number;
  verification_status: InspectionVerificationStatus;
  schedule_id: string | null;
  attendance_id: string | null;
  work_session_id: string | null;
  employee_name_snapshot: string;
  employee_no_snapshot: string | null;
  job_title_snapshot: string | null;
  site_name_snapshot: string;
  inspector_name_snapshot: string;
  previous_inspection_id: string | null;
  reinspection_required: number;
  reinspection_due_at: string | null;
  status: InspectionSessionStatus;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  time_source: 'device' | 'server';
  device_time: string;
  server_time: string | null;
}

function mapSession(row: SessionRow): InspectionSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    employeeUserId: row.employee_user_id,
    inspectorUserId: row.inspector_user_id,
    employeeQrAssetId: row.employee_qr_asset_id,
    qrScanLogId: row.qr_scan_log_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    inspectorLatitude: row.inspector_latitude,
    inspectorLongitude: row.inspector_longitude,
    inspectorDistanceMeters: row.inspector_distance_meters,
    remoteInspectionWarning: boolFromSql(row.remote_inspection_warning),
    verificationStatus: row.verification_status,
    scheduleId: row.schedule_id,
    attendanceId: row.attendance_id,
    workSessionId: row.work_session_id,
    employeeNameSnapshot: row.employee_name_snapshot,
    employeeNoSnapshot: row.employee_no_snapshot,
    jobTitleSnapshot: row.job_title_snapshot,
    siteNameSnapshot: row.site_name_snapshot,
    inspectorNameSnapshot: row.inspector_name_snapshot,
    previousInspectionId: row.previous_inspection_id,
    reinspectionRequired: boolFromSql(row.reinspection_required),
    reinspectionDueAt: row.reinspection_due_at,
    status: row.status,
    voidReason: row.void_reason,
    voidedBy: row.voided_by,
    voidedAt: row.voided_at,
    timeSource: row.time_source,
    deviceTime: row.device_time,
    serverTime: row.server_time,
    ...mapSync(row),
  };
}

export async function insertInspectionSession(input: {
  tenantId: string;
  siteId: string;
  employeeUserId: string;
  inspectorUserId: string;
  employeeQrAssetId?: string | null;
  qrScanLogId?: string | null;
  startedAt: string;
  inspectorLatitude?: number | null;
  inspectorLongitude?: number | null;
  inspectorDistanceMeters?: number | null;
  remoteInspectionWarning?: boolean;
  verificationStatus: InspectionVerificationStatus;
  scheduleId?: string | null;
  attendanceId?: string | null;
  workSessionId?: string | null;
  employeeNameSnapshot: string;
  employeeNoSnapshot?: string | null;
  jobTitleSnapshot?: string | null;
  siteNameSnapshot: string;
  inspectorNameSnapshot: string;
  previousInspectionId?: string | null;
  deviceTime: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<InspectionSession> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO inspection_sessions (
      id, tenant_id, site_id, employee_user_id, inspector_user_id, employee_qr_asset_id, qr_scan_log_id,
      started_at, completed_at, inspector_latitude, inspector_longitude, inspector_distance_meters,
      remote_inspection_warning, verification_status, schedule_id, attendance_id, work_session_id,
      employee_name_snapshot, employee_no_snapshot, job_title_snapshot, site_name_snapshot, inspector_name_snapshot,
      previous_inspection_id, reinspection_required, reinspection_due_at, status,
      void_reason, voided_by, voided_at, time_source, device_time, server_time,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'draft',
      NULL, NULL, NULL, 'device', ?, NULL, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.employeeUserId,
      input.inspectorUserId,
      input.employeeQrAssetId ?? null,
      input.qrScanLogId ?? null,
      input.startedAt,
      input.inspectorLatitude ?? null,
      input.inspectorLongitude ?? null,
      input.inspectorDistanceMeters ?? null,
      sqlBool(input.remoteInspectionWarning ?? false),
      input.verificationStatus,
      input.scheduleId ?? null,
      input.attendanceId ?? null,
      input.workSessionId ?? null,
      input.employeeNameSnapshot,
      input.employeeNoSnapshot ?? null,
      input.jobTitleSnapshot ?? null,
      input.siteNameSnapshot,
      input.inspectorNameSnapshot,
      input.previousInspectionId ?? null,
      input.deviceTime,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getInspectionSessionById(id, input.tenantId);
  if (!created) throw new Error('建立督勤失敗');
  return created;
}

export async function getInspectionSessionById(id: string, tenantId?: string | null): Promise<InspectionSession | null> {
  const row = tenantId
    ? await getDatabase().getFirst<SessionRow>(
        'SELECT * FROM inspection_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<SessionRow>(
        'SELECT * FROM inspection_sessions WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapSession(row) : null;
}

export async function listInspectionSessions(
  tenantId: string,
  input?: { siteId?: string | null; employeeUserId?: string | null; inspectorUserId?: string | null },
): Promise<InspectionSession[]> {
  const rows = await getDatabase().getAll<SessionRow>(
    `SELECT * FROM inspection_sessions WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY started_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapSession)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.employeeUserId || item.employeeUserId === input.employeeUserId) &&
        (!input?.inspectorUserId || item.inspectorUserId === input.inspectorUserId),
    );
}

export async function updateInspectionSession(
  id: string,
  tenantId: string,
  patch: Partial<
    Pick<
      InspectionSession,
      | 'completedAt'
      | 'status'
      | 'reinspectionRequired'
      | 'reinspectionDueAt'
      | 'voidReason'
      | 'voidedBy'
      | 'voidedAt'
      | 'verificationStatus'
    >
  >,
): Promise<InspectionSession> {
  const current = await getInspectionSessionById(id, tenantId);
  if (!current) throw new Error('找不到督勤');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE inspection_sessions SET
      completed_at = ?, status = ?, reinspection_required = ?, reinspection_due_at = ?,
      void_reason = ?, voided_by = ?, voided_at = ?, verification_status = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.completedAt === undefined ? current.completedAt : patch.completedAt,
      patch.status ?? current.status,
      sqlBool(patch.reinspectionRequired ?? current.reinspectionRequired),
      patch.reinspectionDueAt === undefined ? current.reinspectionDueAt : patch.reinspectionDueAt,
      patch.voidReason === undefined ? current.voidReason : patch.voidReason,
      patch.voidedBy === undefined ? current.voidedBy : patch.voidedBy,
      patch.voidedAt === undefined ? current.voidedAt : patch.voidedAt,
      patch.verificationStatus ?? current.verificationStatus,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getInspectionSessionById(id, tenantId);
  if (!updated) throw new Error('更新督勤失敗');
  return updated;
}
