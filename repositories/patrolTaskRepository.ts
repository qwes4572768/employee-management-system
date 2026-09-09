import { getDatabase } from '@/database/runtime';
import type { PatrolPointLiveStatus, PatrolTaskStatus } from '@/constants/patrol';
import type { PatrolTask, PatrolTaskPoint } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface TaskRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  user_id: string;
  schedule_id: string | null;
  work_session_id: string | null;
  patrol_template_id: string;
  task_date: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: PatrolTaskStatus;
  total_points: number;
  completed_points: number;
  missed_points: number;
  completion_rate: number;
  template_name_snapshot: string;
  site_name_snapshot: string;
}

interface TaskPointRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  patrol_task_id: string;
  patrol_point_id: string;
  point_name_snapshot: string;
  point_code_snapshot: string;
  sequence_no: number;
  window_start_at: string;
  window_end_at: string;
  require_qr: number;
  require_gps: number;
  require_photo: number;
  gps_radius_meters_snapshot: number | null;
  latitude_snapshot: number | null;
  longitude_snapshot: number | null;
  grace_minutes: number;
  is_required: number;
  is_critical: number;
  status: PatrolPointLiveStatus;
  completed_at: string | null;
  missed_at: string | null;
}

function mapTask(row: TaskRow): PatrolTask {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    workSessionId: row.work_session_id,
    patrolTemplateId: row.patrol_template_id,
    taskDate: row.task_date,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    status: row.status,
    totalPoints: row.total_points,
    completedPoints: row.completed_points,
    missedPoints: row.missed_points,
    completionRate: row.completion_rate,
    templateNameSnapshot: row.template_name_snapshot,
    siteNameSnapshot: row.site_name_snapshot,
    ...mapSync(row),
  };
}

function mapTaskPoint(row: TaskPointRow): PatrolTaskPoint {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    patrolTaskId: row.patrol_task_id,
    patrolPointId: row.patrol_point_id,
    pointNameSnapshot: row.point_name_snapshot,
    pointCodeSnapshot: row.point_code_snapshot,
    sequenceNo: row.sequence_no,
    windowStartAt: row.window_start_at,
    windowEndAt: row.window_end_at,
    requireQr: boolFromSql(row.require_qr),
    requireGps: boolFromSql(row.require_gps),
    requirePhoto: boolFromSql(row.require_photo),
    gpsRadiusMetersSnapshot: row.gps_radius_meters_snapshot,
    latitudeSnapshot: row.latitude_snapshot,
    longitudeSnapshot: row.longitude_snapshot,
    graceMinutes: row.grace_minutes,
    isRequired: boolFromSql(row.is_required),
    isCritical: boolFromSql(row.is_critical),
    status: row.status,
    completedAt: row.completed_at,
    missedAt: row.missed_at,
    ...mapSync(row),
  };
}

export async function insertPatrolTask(input: {
  tenantId: string;
  siteId: string;
  userId: string;
  scheduleId?: string | null;
  workSessionId?: string | null;
  patrolTemplateId: string;
  taskDate: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status?: PatrolTaskStatus;
  totalPoints?: number;
  templateNameSnapshot: string;
  siteNameSnapshot: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolTask> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_tasks (
      id, tenant_id, site_id, user_id, schedule_id, work_session_id, patrol_template_id,
      task_date, scheduled_start_at, scheduled_end_at, status,
      total_points, completed_points, missed_points, completion_rate,
      template_name_snapshot, site_name_snapshot,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.userId,
      input.scheduleId ?? null,
      input.workSessionId ?? null,
      input.patrolTemplateId,
      input.taskDate,
      input.scheduledStartAt,
      input.scheduledEndAt,
      input.status ?? 'active',
      input.totalPoints ?? 0,
      input.templateNameSnapshot,
      input.siteNameSnapshot,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolTaskById(id, input.tenantId);
  if (!created) throw new Error('建立巡邏任務失敗');
  return created;
}

export async function getPatrolTaskById(id: string, tenantId?: string | null): Promise<PatrolTask | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TaskRow>(
        'SELECT * FROM patrol_tasks WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<TaskRow>('SELECT * FROM patrol_tasks WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapTask(row) : null;
}

export async function findPatrolTask(input: {
  tenantId: string;
  userId: string;
  patrolTemplateId: string;
  scheduleId?: string | null;
  workSessionId?: string | null;
}): Promise<PatrolTask | null> {
  if (input.scheduleId) {
    const row = await getDatabase().getFirst<TaskRow>(
      `SELECT * FROM patrol_tasks
       WHERE tenant_id = ? AND user_id = ? AND patrol_template_id = ? AND schedule_id = ?
         AND deleted_at IS NULL`,
      [input.tenantId, input.userId, input.patrolTemplateId, input.scheduleId],
    );
    return row ? mapTask(row) : null;
  }
  if (input.workSessionId) {
    const row = await getDatabase().getFirst<TaskRow>(
      `SELECT * FROM patrol_tasks
       WHERE tenant_id = ? AND user_id = ? AND patrol_template_id = ? AND work_session_id = ?
         AND deleted_at IS NULL`,
      [input.tenantId, input.userId, input.patrolTemplateId, input.workSessionId],
    );
    return row ? mapTask(row) : null;
  }
  return null;
}

export async function listPatrolTasks(
  tenantId: string,
  input?: { siteId?: string | null; userId?: string | null; taskDate?: string | null },
): Promise<PatrolTask[]> {
  const rows = await getDatabase().getAll<TaskRow>(
    `SELECT * FROM patrol_tasks WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY scheduled_start_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapTask)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.userId || item.userId === input.userId) &&
        (!input?.taskDate || item.taskDate === input.taskDate),
    );
}

export async function updatePatrolTaskCounters(
  id: string,
  tenantId: string,
  input: {
    status: PatrolTaskStatus;
    totalPoints: number;
    completedPoints: number;
    missedPoints: number;
    completionRate: number;
    workSessionId?: string | null;
  },
): Promise<PatrolTask> {
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE patrol_tasks SET
      status = ?, total_points = ?, completed_points = ?, missed_points = ?, completion_rate = ?,
      work_session_id = COALESCE(?, work_session_id),
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      input.status,
      input.totalPoints,
      input.completedPoints,
      input.missedPoints,
      input.completionRate,
      input.workSessionId ?? null,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getPatrolTaskById(id, tenantId);
  if (!updated) throw new Error('更新巡邏任務失敗');
  return updated;
}

export async function insertPatrolTaskPoint(input: {
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolPointId: string;
  pointNameSnapshot: string;
  pointCodeSnapshot: string;
  sequenceNo: number;
  windowStartAt: string;
  windowEndAt: string;
  requireQr: boolean;
  requireGps: boolean;
  requirePhoto: boolean;
  gpsRadiusMetersSnapshot?: number | null;
  latitudeSnapshot?: number | null;
  longitudeSnapshot?: number | null;
  graceMinutes: number;
  isRequired: boolean;
  isCritical: boolean;
  status?: PatrolPointLiveStatus;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolTaskPoint> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_task_points (
      id, tenant_id, site_id, patrol_task_id, patrol_point_id,
      point_name_snapshot, point_code_snapshot, sequence_no,
      window_start_at, window_end_at, require_qr, require_gps, require_photo,
      gps_radius_meters_snapshot, latitude_snapshot, longitude_snapshot,
      grace_minutes, is_required, is_critical, status, completed_at, missed_at,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.patrolTaskId,
      input.patrolPointId,
      input.pointNameSnapshot,
      input.pointCodeSnapshot,
      input.sequenceNo,
      input.windowStartAt,
      input.windowEndAt,
      sqlBool(input.requireQr),
      sqlBool(input.requireGps),
      sqlBool(input.requirePhoto),
      input.gpsRadiusMetersSnapshot ?? null,
      input.latitudeSnapshot ?? null,
      input.longitudeSnapshot ?? null,
      input.graceMinutes,
      sqlBool(input.isRequired),
      sqlBool(input.isCritical),
      input.status ?? 'upcoming',
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolTaskPointById(id, input.tenantId);
  if (!created) throw new Error('建立任務巡邏點失敗');
  return created;
}

export async function getPatrolTaskPointById(id: string, tenantId?: string | null): Promise<PatrolTaskPoint | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TaskPointRow>(
        'SELECT * FROM patrol_task_points WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<TaskPointRow>(
        'SELECT * FROM patrol_task_points WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapTaskPoint(row) : null;
}

export async function listPatrolTaskPoints(tenantId: string, taskId: string): Promise<PatrolTaskPoint[]> {
  const rows = await getDatabase().getAll<TaskPointRow>(
    `SELECT * FROM patrol_task_points
     WHERE tenant_id = ? AND patrol_task_id = ? AND deleted_at IS NULL
     ORDER BY sequence_no ASC`,
    [tenantId, taskId],
  );
  return rows.map(mapTaskPoint);
}

export async function updatePatrolTaskPointState(
  id: string,
  tenantId: string,
  input: {
    status: PatrolPointLiveStatus;
    completedAt?: string | null;
    missedAt?: string | null;
  },
): Promise<PatrolTaskPoint> {
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE patrol_task_points SET
      status = ?, completed_at = ?, missed_at = COALESCE(?, missed_at),
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [input.status, input.completedAt ?? null, input.missedAt ?? null, ts, id, tenantId],
  );
  const updated = await getPatrolTaskPointById(id, tenantId);
  if (!updated) throw new Error('更新任務巡邏點失敗');
  return updated;
}
