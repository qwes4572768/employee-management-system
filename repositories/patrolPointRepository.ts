import { getDatabase } from '@/database/runtime';
import type { PatrolPoint } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface PointRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  code: string;
  description: string | null;
  location_note: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_radius_meters: number | null;
  require_qr: number;
  require_gps: number;
  require_photo: number;
  status: 'active' | 'inactive';
  sort_order: number;
}

function mapPoint(row: PointRow): PatrolPoint {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    name: row.name,
    code: row.code,
    description: row.description,
    locationNote: row.location_note,
    latitude: row.latitude,
    longitude: row.longitude,
    gpsRadiusMeters: row.gps_radius_meters,
    requireQr: boolFromSql(row.require_qr),
    requireGps: boolFromSql(row.require_gps),
    requirePhoto: boolFromSql(row.require_photo),
    status: row.status,
    sortOrder: row.sort_order,
    ...mapSync(row),
  };
}

export async function insertPatrolPoint(input: {
  tenantId: string;
  siteId: string;
  name: string;
  code: string;
  description?: string | null;
  locationNote?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gpsRadiusMeters?: number | null;
  requireQr?: boolean;
  requireGps?: boolean;
  requirePhoto?: boolean;
  sortOrder?: number;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolPoint> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_points (
      id, tenant_id, site_id, name, code, description, location_note,
      latitude, longitude, gps_radius_meters, require_qr, require_gps, require_photo,
      status, sort_order, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.name,
      input.code,
      input.description ?? null,
      input.locationNote ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.gpsRadiusMeters ?? null,
      sqlBool(input.requireQr ?? true),
      sqlBool(input.requireGps ?? false),
      sqlBool(input.requirePhoto ?? false),
      input.sortOrder ?? 0,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolPointById(id, input.tenantId);
  if (!created) throw new Error('建立巡邏點失敗');
  return created;
}

export async function getPatrolPointById(id: string, tenantId?: string | null): Promise<PatrolPoint | null> {
  const row = tenantId
    ? await getDatabase().getFirst<PointRow>(
        'SELECT * FROM patrol_points WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<PointRow>('SELECT * FROM patrol_points WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapPoint(row) : null;
}

export async function listPatrolPoints(
  tenantId: string,
  input?: { siteId?: string | null; status?: 'active' | 'inactive' | null },
): Promise<PatrolPoint[]> {
  const rows = await getDatabase().getAll<PointRow>(
    `SELECT * FROM patrol_points WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [tenantId],
  );
  return rows
    .map(mapPoint)
    .filter((item) => (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status));
}

export async function updatePatrolPoint(
  id: string,
  tenantId: string,
  patch: Partial<
    Pick<
      PatrolPoint,
      | 'name'
      | 'code'
      | 'description'
      | 'locationNote'
      | 'latitude'
      | 'longitude'
      | 'gpsRadiusMeters'
      | 'requireQr'
      | 'requireGps'
      | 'requirePhoto'
      | 'status'
      | 'sortOrder'
    >
  >,
): Promise<PatrolPoint> {
  const current = await getPatrolPointById(id, tenantId);
  if (!current) throw new Error('找不到巡邏點');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE patrol_points SET
      name = ?, code = ?, description = ?, location_note = ?,
      latitude = ?, longitude = ?, gps_radius_meters = ?,
      require_qr = ?, require_gps = ?, require_photo = ?,
      status = ?, sort_order = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      patch.name ?? current.name,
      patch.code ?? current.code,
      patch.description === undefined ? current.description : patch.description,
      patch.locationNote === undefined ? current.locationNote : patch.locationNote,
      patch.latitude === undefined ? current.latitude : patch.latitude,
      patch.longitude === undefined ? current.longitude : patch.longitude,
      patch.gpsRadiusMeters === undefined ? current.gpsRadiusMeters : patch.gpsRadiusMeters,
      sqlBool(patch.requireQr ?? current.requireQr),
      sqlBool(patch.requireGps ?? current.requireGps),
      sqlBool(patch.requirePhoto ?? current.requirePhoto),
      patch.status ?? current.status,
      patch.sortOrder ?? current.sortOrder,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getPatrolPointById(id, tenantId);
  if (!updated) throw new Error('更新巡邏點失敗');
  return updated;
}
