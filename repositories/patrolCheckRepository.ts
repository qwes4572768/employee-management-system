import { getDatabase } from '@/database/runtime';
import type { PatrolCheckResult, PatrolTimeSource } from '@/constants/patrol';
import type { PatrolCheckRecord, PatrolEvidence } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

interface CheckRow {
  id: string;
  tenant_id: string;
  site_id: string;
  patrol_task_id: string;
  patrol_task_point_id: string;
  user_id: string;
  checked_at: string;
  qr_asset_id: string | null;
  qr_scan_log_id: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
  gps_accuracy: number | null;
  gps_mocked: number | null;
  photo_required: number;
  photo_completed: number;
  result: PatrolCheckResult;
  note: string | null;
  time_source: PatrolTimeSource;
  device_time: string;
  server_time: string | null;
  created_by: string | null;
  created_at: string;
  version: number;
  sync_status: string;
  device_id: string | null;
}

interface EvidenceRow {
  id: string;
  tenant_id: string;
  site_id: string;
  patrol_task_id: string;
  patrol_task_point_id: string | null;
  local_uri: string;
  watermark_uri: string | null;
  captured_by: string | null;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  device_id: string | null;
  created_at: string;
  sync_status: string;
}

function mapCheck(row: CheckRow): PatrolCheckRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    patrolTaskId: row.patrol_task_id,
    patrolTaskPointId: row.patrol_task_point_id,
    userId: row.user_id,
    checkedAt: row.checked_at,
    qrAssetId: row.qr_asset_id,
    qrScanLogId: row.qr_scan_log_id,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceMeters: row.distance_meters,
    gpsAccuracy: row.gps_accuracy,
    gpsMocked: row.gps_mocked == null ? null : boolFromSql(row.gps_mocked),
    photoRequired: boolFromSql(row.photo_required),
    photoCompleted: boolFromSql(row.photo_completed),
    result: row.result,
    note: row.note,
    timeSource: row.time_source,
    deviceTime: row.device_time,
    serverTime: row.server_time,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
    syncStatus: row.sync_status,
    deviceId: row.device_id,
  };
}

function mapEvidence(row: EvidenceRow): PatrolEvidence {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    patrolTaskId: row.patrol_task_id,
    patrolTaskPointId: row.patrol_task_point_id,
    localUri: row.local_uri,
    watermarkUri: row.watermark_uri,
    capturedBy: row.captured_by,
    capturedAt: row.captured_at,
    latitude: row.latitude,
    longitude: row.longitude,
    deviceId: row.device_id,
    createdAt: row.created_at,
    syncStatus: row.sync_status,
  };
}

export async function insertPatrolCheckRecord(input: {
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolTaskPointId: string;
  userId: string;
  checkedAt: string;
  qrAssetId?: string | null;
  qrScanLogId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  gpsAccuracy?: number | null;
  gpsMocked?: boolean | null;
  photoRequired: boolean;
  photoCompleted: boolean;
  result: PatrolCheckResult;
  note?: string | null;
  timeSource?: PatrolTimeSource;
  deviceTime: string;
  serverTime?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolCheckRecord> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_check_records (
      id, tenant_id, site_id, patrol_task_id, patrol_task_point_id, user_id, checked_at,
      qr_asset_id, qr_scan_log_id, latitude, longitude, distance_meters, gps_accuracy, gps_mocked,
      photo_required, photo_completed, result, note, time_source, device_time, server_time,
      created_by, created_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.patrolTaskId,
      input.patrolTaskPointId,
      input.userId,
      input.checkedAt,
      input.qrAssetId ?? null,
      input.qrScanLogId ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.distanceMeters ?? null,
      input.gpsAccuracy ?? null,
      input.gpsMocked == null ? null : sqlBool(input.gpsMocked),
      sqlBool(input.photoRequired),
      sqlBool(input.photoCompleted),
      input.result,
      input.note ?? null,
      input.timeSource ?? 'device',
      input.deviceTime,
      input.serverTime ?? null,
      input.createdBy,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolCheckById(id, input.tenantId);
  if (!created) throw new Error('寫入巡邏紀錄失敗');
  return created;
}

export async function getPatrolCheckById(id: string, tenantId?: string | null): Promise<PatrolCheckRecord | null> {
  const row = tenantId
    ? await getDatabase().getFirst<CheckRow>(
        'SELECT * FROM patrol_check_records WHERE id = ? AND tenant_id = ?',
        [id, tenantId],
      )
    : await getDatabase().getFirst<CheckRow>('SELECT * FROM patrol_check_records WHERE id = ?', [id]);
  return row ? mapCheck(row) : null;
}

export async function getEffectivePatrolCheck(
  tenantId: string,
  taskPointId: string,
): Promise<PatrolCheckRecord | null> {
  const row = await getDatabase().getFirst<CheckRow>(
    `SELECT * FROM patrol_check_records
     WHERE tenant_id = ? AND patrol_task_point_id = ?
       AND result IN ('success', 'late_success', 'manual_override')
     ORDER BY checked_at DESC`,
    [tenantId, taskPointId],
  );
  return row ? mapCheck(row) : null;
}

export async function listPatrolChecksForTask(tenantId: string, taskId: string): Promise<PatrolCheckRecord[]> {
  const rows = await getDatabase().getAll<CheckRow>(
    `SELECT * FROM patrol_check_records WHERE tenant_id = ? AND patrol_task_id = ? ORDER BY checked_at ASC`,
    [tenantId, taskId],
  );
  return rows.map(mapCheck);
}

export async function insertPatrolEvidence(input: {
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolTaskPointId?: string | null;
  localUri: string;
  watermarkUri?: string | null;
  capturedBy: string | null;
  capturedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  deviceId: string | null;
}): Promise<PatrolEvidence> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_evidence (
      id, tenant_id, site_id, patrol_task_id, patrol_task_point_id,
      local_uri, watermark_uri, captured_by, captured_at, latitude, longitude,
      device_id, created_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.patrolTaskId,
      input.patrolTaskPointId ?? null,
      input.localUri,
      input.watermarkUri ?? null,
      input.capturedBy,
      input.capturedAt,
      input.latitude ?? null,
      input.longitude ?? null,
      input.deviceId,
      ts,
    ],
  );
  const created = await getPatrolEvidenceById(id, input.tenantId);
  if (!created) throw new Error('保存巡邏照片失敗');
  return created;
}

export async function getPatrolEvidenceById(id: string, tenantId?: string | null): Promise<PatrolEvidence | null> {
  const row = tenantId
    ? await getDatabase().getFirst<EvidenceRow>(
        'SELECT * FROM patrol_evidence WHERE id = ? AND tenant_id = ?',
        [id, tenantId],
      )
    : await getDatabase().getFirst<EvidenceRow>('SELECT * FROM patrol_evidence WHERE id = ?', [id]);
  return row ? mapEvidence(row) : null;
}

export async function listPatrolEvidenceForPoint(
  tenantId: string,
  taskPointId: string,
): Promise<PatrolEvidence[]> {
  const rows = await getDatabase().getAll<EvidenceRow>(
    `SELECT * FROM patrol_evidence WHERE tenant_id = ? AND patrol_task_point_id = ? ORDER BY captured_at DESC`,
    [tenantId, taskPointId],
  );
  return rows.map(mapEvidence);
}
