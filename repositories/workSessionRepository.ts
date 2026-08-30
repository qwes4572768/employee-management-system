import { getDatabase } from '@/database/runtime';
import type { WorkSession } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface Row extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  user_id: string;
  schedule_id: string | null;
  attendance_id: string | null;
  started_at: string;
  ended_at: string | null;
  start_method: string;
  end_method: string | null;
  status: WorkSession['status'];
  unscheduled: number;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  note: string | null;
}

function mapRow(row: Row): WorkSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    attendanceId: row.attendance_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startMethod: row.start_method,
    endMethod: row.end_method,
    status: row.status,
    unscheduled: boolFromSql(row.unscheduled),
    startLatitude: row.start_latitude,
    startLongitude: row.start_longitude,
    endLatitude: row.end_latitude,
    endLongitude: row.end_longitude,
    note: row.note,
    ...mapSync(row),
  };
}

export async function getWorkSessionById(id: string, tenantId?: string | null): Promise<WorkSession | null> {
  const row = tenantId
    ? await getDatabase().getFirst<Row>(
        'SELECT * FROM work_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<Row>('SELECT * FROM work_sessions WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapRow(row) : null;
}

export async function getActiveWorkSession(tenantId: string, userId: string): Promise<WorkSession | null> {
  const row = await getDatabase().getFirst<Row>(
    `SELECT * FROM work_sessions
     WHERE tenant_id = ? AND user_id = ? AND status = 'active' AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, userId],
  );
  return row ? mapRow(row) : null;
}

export async function listActiveWorkSessionsForSite(tenantId: string, siteId: string): Promise<WorkSession[]> {
  const rows = await getDatabase().getAll<Row>(
    `SELECT * FROM work_sessions
     WHERE tenant_id = ? AND site_id = ? AND status = 'active' AND deleted_at IS NULL
     ORDER BY started_at ASC`,
    [tenantId, siteId],
  );
  return rows.map(mapRow);
}

export async function insertWorkSession(input: {
  tenantId: string;
  siteId: string;
  userId: string;
  scheduleId?: string | null;
  attendanceId?: string | null;
  startedAt: string;
  startMethod: string;
  unscheduled?: boolean;
  startLatitude?: number | null;
  startLongitude?: number | null;
  note?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<WorkSession> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO work_sessions (
      id, tenant_id, site_id, user_id, schedule_id, attendance_id, started_at, start_method, status, unscheduled,
      start_latitude, start_longitude, note, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.userId,
      input.scheduleId ?? null,
      input.attendanceId ?? null,
      input.startedAt,
      input.startMethod,
      sqlBool(input.unscheduled ?? false),
      input.startLatitude ?? null,
      input.startLongitude ?? null,
      input.note ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getWorkSessionById(id, input.tenantId);
  if (!created) throw new Error('建立勤務階段失敗');
  return created;
}

export async function updateWorkSession(
  id: string,
  tenantId: string,
  patch: Partial<{
    endedAt: string | null;
    endMethod: string | null;
    status: WorkSession['status'];
    endLatitude: number | null;
    endLongitude: number | null;
    note: string | null;
  }>,
): Promise<WorkSession> {
  const current = await getWorkSessionById(id, tenantId);
  if (!current) throw new Error('找不到勤務階段');
  await getDatabase().run(
    `UPDATE work_sessions SET
      ended_at = ?, end_method = ?, status = ?, end_latitude = ?, end_longitude = ?, note = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.endedAt === undefined ? current.endedAt : patch.endedAt,
      patch.endMethod === undefined ? current.endMethod : patch.endMethod,
      patch.status ?? current.status,
      patch.endLatitude === undefined ? current.endLatitude : patch.endLatitude,
      patch.endLongitude === undefined ? current.endLongitude : patch.endLongitude,
      patch.note === undefined ? current.note : patch.note,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getWorkSessionById(id, tenantId);
  if (!updated) throw new Error('更新勤務階段失敗');
  return updated;
}
