import { getDatabase } from '@/database/runtime';
import type { AttendanceCorrectionRequest, AttendanceRecord } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface AttendanceRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  user_id: string;
  schedule_id: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_in_distance_meters: number | null;
  clock_out_distance_meters: number | null;
  clock_in_method: string | null;
  clock_out_method: string | null;
  status: string;
  clock_in_note: string | null;
  clock_out_note: string | null;
}

interface CorrectionRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  user_id: string;
  attendance_id: string | null;
  schedule_id: string | null;
  request_type: AttendanceCorrectionRequest['requestType'];
  requested_clock_in_at: string | null;
  requested_clock_out_at: string | null;
  reason: string;
  status: AttendanceCorrectionRequest['status'];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  original_clock_in_at: string | null;
  original_clock_out_at: string | null;
}

function mapAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    clockInLatitude: row.clock_in_latitude,
    clockInLongitude: row.clock_in_longitude,
    clockOutLatitude: row.clock_out_latitude,
    clockOutLongitude: row.clock_out_longitude,
    clockInDistanceMeters: row.clock_in_distance_meters,
    clockOutDistanceMeters: row.clock_out_distance_meters,
    clockInMethod: row.clock_in_method,
    clockOutMethod: row.clock_out_method,
    status: row.status,
    clockInNote: row.clock_in_note,
    clockOutNote: row.clock_out_note,
    ...mapSync(row),
  };
}

function mapCorrection(row: CorrectionRow): AttendanceCorrectionRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    userId: row.user_id,
    attendanceId: row.attendance_id,
    scheduleId: row.schedule_id,
    requestType: row.request_type,
    requestedClockInAt: row.requested_clock_in_at,
    requestedClockOutAt: row.requested_clock_out_at,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    originalClockInAt: row.original_clock_in_at,
    originalClockOutAt: row.original_clock_out_at,
    ...mapSync(row),
  };
}

export async function insertAttendance(input: {
  tenantId: string;
  siteId: string;
  userId: string;
  scheduleId?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<AttendanceRecord> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO attendance_records (
      id, tenant_id, site_id, user_id, schedule_id, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, ?, NULL, 1, 'local', ?)`,
    [id, input.tenantId, input.siteId, input.userId, input.scheduleId ?? null, input.createdBy, ts, ts, input.deviceId],
  );
  const created = await getAttendanceById(id, input.tenantId);
  if (!created) throw new Error('建立出勤紀錄失敗');
  return created;
}

export async function getAttendanceById(id: string, tenantId?: string | null): Promise<AttendanceRecord | null> {
  const row = tenantId
    ? await getDatabase().getFirst<AttendanceRow>(
        'SELECT * FROM attendance_records WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<AttendanceRow>(
        'SELECT * FROM attendance_records WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapAttendance(row) : null;
}

export async function getOpenAttendance(
  tenantId: string,
  userId: string,
  siteId: string,
): Promise<AttendanceRecord | null> {
  const row = await getDatabase().getFirst<AttendanceRow>(
    `SELECT * FROM attendance_records
     WHERE tenant_id = ? AND user_id = ? AND site_id = ? AND deleted_at IS NULL
       AND clock_in_at IS NOT NULL AND clock_out_at IS NULL
     ORDER BY clock_in_at DESC LIMIT 1`,
    [tenantId, userId, siteId],
  );
  return row ? mapAttendance(row) : null;
}

export async function getAttendanceBySchedule(
  tenantId: string,
  scheduleId: string,
): Promise<AttendanceRecord | null> {
  const row = await getDatabase().getFirst<AttendanceRow>(
    `SELECT * FROM attendance_records
     WHERE tenant_id = ? AND schedule_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, scheduleId],
  );
  return row ? mapAttendance(row) : null;
}

export async function listAttendanceForSiteDate(
  tenantId: string,
  siteId: string,
  dayStartIso: string,
  dayEndIso: string,
): Promise<AttendanceRecord[]> {
  const rows = await getDatabase().getAll<AttendanceRow>(
    `SELECT * FROM attendance_records
     WHERE tenant_id = ? AND site_id = ? AND deleted_at IS NULL
       AND (
         (clock_in_at IS NOT NULL AND clock_in_at >= ? AND clock_in_at < ?)
         OR (clock_in_at IS NULL AND created_at >= ? AND created_at < ?)
       )
     ORDER BY created_at ASC`,
    [tenantId, siteId, dayStartIso, dayEndIso, dayStartIso, dayEndIso],
  );
  return rows.map(mapAttendance);
}

export async function listAttendanceForUser(
  tenantId: string,
  userId: string,
): Promise<AttendanceRecord[]> {
  const rows = await getDatabase().getAll<AttendanceRow>(
    `SELECT * FROM attendance_records WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId, userId],
  );
  return rows.map(mapAttendance);
}

export async function updateAttendance(
  id: string,
  tenantId: string,
  patch: Partial<{
    clockInAt: string | null;
    clockOutAt: string | null;
    clockInLatitude: number | null;
    clockInLongitude: number | null;
    clockOutLatitude: number | null;
    clockOutLongitude: number | null;
    clockInDistanceMeters: number | null;
    clockOutDistanceMeters: number | null;
    clockInMethod: string | null;
    clockOutMethod: string | null;
    status: string;
    clockInNote: string | null;
    clockOutNote: string | null;
    scheduleId: string | null;
  }>,
): Promise<AttendanceRecord> {
  const current = await getAttendanceById(id, tenantId);
  if (!current) throw new Error('找不到出勤紀錄');
  await getDatabase().run(
    `UPDATE attendance_records SET
      clock_in_at = ?, clock_out_at = ?, clock_in_latitude = ?, clock_in_longitude = ?,
      clock_out_latitude = ?, clock_out_longitude = ?, clock_in_distance_meters = ?, clock_out_distance_meters = ?,
      clock_in_method = ?, clock_out_method = ?, status = ?, clock_in_note = ?, clock_out_note = ?, schedule_id = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.clockInAt === undefined ? current.clockInAt : patch.clockInAt,
      patch.clockOutAt === undefined ? current.clockOutAt : patch.clockOutAt,
      patch.clockInLatitude === undefined ? current.clockInLatitude : patch.clockInLatitude,
      patch.clockInLongitude === undefined ? current.clockInLongitude : patch.clockInLongitude,
      patch.clockOutLatitude === undefined ? current.clockOutLatitude : patch.clockOutLatitude,
      patch.clockOutLongitude === undefined ? current.clockOutLongitude : patch.clockOutLongitude,
      patch.clockInDistanceMeters === undefined ? current.clockInDistanceMeters : patch.clockInDistanceMeters,
      patch.clockOutDistanceMeters === undefined ? current.clockOutDistanceMeters : patch.clockOutDistanceMeters,
      patch.clockInMethod === undefined ? current.clockInMethod : patch.clockInMethod,
      patch.clockOutMethod === undefined ? current.clockOutMethod : patch.clockOutMethod,
      patch.status ?? current.status,
      patch.clockInNote === undefined ? current.clockInNote : patch.clockInNote,
      patch.clockOutNote === undefined ? current.clockOutNote : patch.clockOutNote,
      patch.scheduleId === undefined ? current.scheduleId : patch.scheduleId,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getAttendanceById(id, tenantId);
  if (!updated) throw new Error('更新出勤失敗');
  return updated;
}

export async function insertCorrectionRequest(input: {
  tenantId: string;
  siteId: string;
  userId: string;
  attendanceId?: string | null;
  scheduleId?: string | null;
  requestType: AttendanceCorrectionRequest['requestType'];
  requestedClockInAt?: string | null;
  requestedClockOutAt?: string | null;
  reason: string;
  originalClockInAt?: string | null;
  originalClockOutAt?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<AttendanceCorrectionRequest> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO attendance_correction_requests (
      id, tenant_id, site_id, user_id, attendance_id, schedule_id, request_type,
      requested_clock_in_at, requested_clock_out_at, reason, status,
      original_clock_in_at, original_clock_out_at,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.userId,
      input.attendanceId ?? null,
      input.scheduleId ?? null,
      input.requestType,
      input.requestedClockInAt ?? null,
      input.requestedClockOutAt ?? null,
      input.reason.trim(),
      input.originalClockInAt ?? null,
      input.originalClockOutAt ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getCorrectionById(id, input.tenantId);
  if (!created) throw new Error('建立補卡申請失敗');
  return created;
}

export async function getCorrectionById(
  id: string,
  tenantId?: string | null,
): Promise<AttendanceCorrectionRequest | null> {
  const row = tenantId
    ? await getDatabase().getFirst<CorrectionRow>(
        'SELECT * FROM attendance_correction_requests WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<CorrectionRow>(
        'SELECT * FROM attendance_correction_requests WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapCorrection(row) : null;
}

export async function listPendingCorrections(tenantId: string): Promise<AttendanceCorrectionRequest[]> {
  const rows = await getDatabase().getAll<CorrectionRow>(
    `SELECT * FROM attendance_correction_requests
     WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'pending'
     ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows.map(mapCorrection);
}

export async function updateCorrection(
  id: string,
  tenantId: string,
  patch: Partial<{
    status: AttendanceCorrectionRequest['status'];
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
  }>,
): Promise<AttendanceCorrectionRequest> {
  const current = await getCorrectionById(id, tenantId);
  if (!current) throw new Error('找不到補卡申請');
  await getDatabase().run(
    `UPDATE attendance_correction_requests SET
      status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.status ?? current.status,
      patch.reviewedBy === undefined ? current.reviewedBy : patch.reviewedBy,
      patch.reviewedAt === undefined ? current.reviewedAt : patch.reviewedAt,
      patch.reviewNote === undefined ? current.reviewNote : patch.reviewNote,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getCorrectionById(id, tenantId);
  if (!updated) throw new Error('更新補卡申請失敗');
  return updated;
}
