import { getDatabase } from '@/database/runtime';
import type {
  ResidentVehicleStatus,
  ResidentVehicleType,
  VehicleAccessStatus,
  VehicleAccessType,
  VehicleMovementEventKind,
} from '@/constants/mobility';
import type { ResidentVehicle, VehicleAccessPass, VehicleMovement } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface VehicleRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  resident_id: string | null;
  unit_id: string | null;
  plate_no: string;
  plate_no_normalized: string;
  vehicle_type: ResidentVehicleType;
  brand: string | null;
  model: string | null;
  color: string | null;
  is_primary: number;
  status: ResidentVehicleStatus;
  allow_duplicate: number;
  notes: string | null;
}

interface PassRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  vehicle_id: string | null;
  unit_id: string | null;
  visitor_pass_id: string | null;
  plate_no_snapshot: string;
  plate_no_normalized: string;
  access_type: VehicleAccessType;
  valid_from: string | null;
  valid_until: string | null;
  status: VehicleAccessStatus;
  notes: string | null;
}

interface MovementRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  vehicle_id: string | null;
  access_pass_id: string | null;
  plate_no_snapshot: string;
  plate_no_normalized: string;
  direction: 'in' | 'out';
  gate_name: string | null;
  occurred_at: string;
  processed_by: string | null;
  photo_uri: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  time_source: 'device' | 'server';
  device_time: string;
  server_time: string | null;
  event_kind: VehicleMovementEventKind;
  corrects_id: string | null;
  reason: string | null;
}

function mapVehicle(row: VehicleRow): ResidentVehicle {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    residentId: row.resident_id,
    unitId: row.unit_id,
    plateNo: row.plate_no,
    plateNoNormalized: row.plate_no_normalized,
    vehicleType: row.vehicle_type,
    brand: row.brand,
    model: row.model,
    color: row.color,
    isPrimary: boolFromSql(row.is_primary),
    status: row.status,
    allowDuplicate: boolFromSql(row.allow_duplicate),
    notes: row.notes,
    ...mapSync(row),
  };
}

function mapPass(row: PassRow): VehicleAccessPass {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    vehicleId: row.vehicle_id,
    unitId: row.unit_id,
    visitorPassId: row.visitor_pass_id,
    plateNoSnapshot: row.plate_no_snapshot,
    plateNoNormalized: row.plate_no_normalized,
    accessType: row.access_type,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    notes: row.notes,
    ...mapSync(row),
  };
}

function mapMovement(row: MovementRow): VehicleMovement {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    vehicleId: row.vehicle_id,
    accessPassId: row.access_pass_id,
    plateNoSnapshot: row.plate_no_snapshot,
    plateNoNormalized: row.plate_no_normalized,
    direction: row.direction,
    gateName: row.gate_name,
    occurredAt: row.occurred_at,
    processedBy: row.processed_by,
    photoUri: row.photo_uri,
    latitude: row.latitude,
    longitude: row.longitude,
    note: row.note,
    timeSource: row.time_source,
    deviceTime: row.device_time,
    serverTime: row.server_time,
    eventKind: row.event_kind ?? 'movement',
    correctsId: row.corrects_id,
    reason: row.reason,
    ...mapSync(row),
  };
}

export async function insertResidentVehicle(input: {
  tenantId: string;
  siteId: string;
  residentId?: string | null;
  unitId?: string | null;
  plateNo: string;
  plateNoNormalized: string;
  vehicleType: ResidentVehicleType;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  isPrimary?: boolean;
  allowDuplicate?: boolean;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ResidentVehicle> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO resident_vehicles (
      id, tenant_id, site_id, resident_id, unit_id, plate_no, plate_no_normalized, vehicle_type,
      brand, model, color, is_primary, status, allow_duplicate, notes,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.residentId ?? null,
      input.unitId ?? null,
      input.plateNo,
      input.plateNoNormalized,
      input.vehicleType,
      input.brand ?? null,
      input.model ?? null,
      input.color ?? null,
      sqlBool(input.isPrimary ?? false),
      sqlBool(input.allowDuplicate ?? false),
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getResidentVehicleById(id, input.tenantId);
  if (!created) throw new Error('建立車輛失敗');
  return created;
}

export async function getResidentVehicleById(id: string, tenantId?: string | null): Promise<ResidentVehicle | null> {
  const row = tenantId
    ? await getDatabase().getFirst<VehicleRow>(
        'SELECT * FROM resident_vehicles WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<VehicleRow>(
        'SELECT * FROM resident_vehicles WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapVehicle(row) : null;
}

export async function listResidentVehicles(
  tenantId: string,
  input?: { siteId?: string | null; status?: ResidentVehicleStatus | null },
): Promise<ResidentVehicle[]> {
  const rows = await getDatabase().getAll<VehicleRow>(
    `SELECT * FROM resident_vehicles WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY plate_no_normalized`,
    [tenantId],
  );
  return rows
    .map(mapVehicle)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status),
    );
}

export async function updateResidentVehicle(
  id: string,
  tenantId: string,
  patch: Partial<Pick<ResidentVehicle, 'plateNo' | 'plateNoNormalized' | 'vehicleType' | 'brand' | 'model' | 'color' | 'isPrimary' | 'status' | 'notes'>>,
): Promise<ResidentVehicle> {
  const current = await getResidentVehicleById(id, tenantId);
  if (!current) throw new Error('找不到車輛');
  await getDatabase().run(
    `UPDATE resident_vehicles SET
      plate_no = ?, plate_no_normalized = ?, vehicle_type = ?, brand = ?, model = ?, color = ?,
      is_primary = ?, status = ?, notes = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.plateNo ?? current.plateNo,
      patch.plateNoNormalized ?? current.plateNoNormalized,
      patch.vehicleType ?? current.vehicleType,
      patch.brand === undefined ? current.brand : patch.brand,
      patch.model === undefined ? current.model : patch.model,
      patch.color === undefined ? current.color : patch.color,
      sqlBool(patch.isPrimary ?? current.isPrimary),
      patch.status ?? current.status,
      patch.notes === undefined ? current.notes : patch.notes,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getResidentVehicleById(id, tenantId);
  if (!updated) throw new Error('更新車輛失敗');
  return updated;
}

export async function insertVehicleAccessPass(input: {
  tenantId: string;
  siteId: string;
  vehicleId?: string | null;
  unitId?: string | null;
  visitorPassId?: string | null;
  plateNoSnapshot: string;
  plateNoNormalized: string;
  accessType: VehicleAccessType;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<VehicleAccessPass> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO vehicle_access_passes (
      id, tenant_id, site_id, vehicle_id, unit_id, visitor_pass_id, plate_no_snapshot, plate_no_normalized,
      access_type, valid_from, valid_until, status, notes,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.vehicleId ?? null,
      input.unitId ?? null,
      input.visitorPassId ?? null,
      input.plateNoSnapshot,
      input.plateNoNormalized,
      input.accessType,
      input.validFrom ?? ts,
      input.validUntil ?? null,
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getVehicleAccessPassById(id, input.tenantId);
  if (!created) throw new Error('建立通行證失敗');
  return created;
}

export async function getVehicleAccessPassById(id: string, tenantId?: string | null): Promise<VehicleAccessPass | null> {
  const row = tenantId
    ? await getDatabase().getFirst<PassRow>(
        'SELECT * FROM vehicle_access_passes WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<PassRow>(
        'SELECT * FROM vehicle_access_passes WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapPass(row) : null;
}

export async function listVehicleAccessPasses(
  tenantId: string,
  input?: { siteId?: string | null; status?: VehicleAccessStatus | null },
): Promise<VehicleAccessPass[]> {
  const rows = await getDatabase().getAll<PassRow>(
    `SELECT * FROM vehicle_access_passes WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapPass)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status),
    );
}

export async function updateVehicleAccessPass(
  id: string,
  tenantId: string,
  patch: Partial<Pick<VehicleAccessPass, 'status' | 'validUntil' | 'notes'>>,
): Promise<VehicleAccessPass> {
  const current = await getVehicleAccessPassById(id, tenantId);
  if (!current) throw new Error('找不到通行證');
  await getDatabase().run(
    `UPDATE vehicle_access_passes SET status = ?, valid_until = ?, notes = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.status ?? current.status,
      patch.validUntil === undefined ? current.validUntil : patch.validUntil,
      patch.notes === undefined ? current.notes : patch.notes,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getVehicleAccessPassById(id, tenantId);
  if (!updated) throw new Error('更新通行證失敗');
  return updated;
}

export async function insertVehicleMovement(input: {
  tenantId: string;
  siteId: string;
  vehicleId?: string | null;
  accessPassId?: string | null;
  plateNoSnapshot: string;
  plateNoNormalized: string;
  direction: 'in' | 'out';
  gateName?: string | null;
  occurredAt: string;
  processedBy: string | null;
  photoUri?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
  deviceTime: string;
  eventKind?: VehicleMovementEventKind;
  correctsId?: string | null;
  reason?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<VehicleMovement> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO vehicle_movements (
      id, tenant_id, site_id, vehicle_id, access_pass_id, plate_no_snapshot, plate_no_normalized,
      direction, gate_name, occurred_at, processed_by, photo_uri, latitude, longitude, note,
      time_source, device_time, server_time, event_kind, corrects_id, reason,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'device', ?, NULL, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.vehicleId ?? null,
      input.accessPassId ?? null,
      input.plateNoSnapshot,
      input.plateNoNormalized,
      input.direction,
      input.gateName ?? null,
      input.occurredAt,
      input.processedBy,
      input.photoUri ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.note ?? null,
      input.deviceTime,
      input.eventKind ?? 'movement',
      input.correctsId ?? null,
      input.reason ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<MovementRow>(
    'SELECT * FROM vehicle_movements WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入進出紀錄失敗');
  return mapMovement(row);
}

export async function listVehicleMovements(
  tenantId: string,
  input?: { siteId?: string | null; plateNoNormalized?: string | null; accessPassId?: string | null },
): Promise<VehicleMovement[]> {
  const rows = await getDatabase().getAll<MovementRow>(
    `SELECT * FROM vehicle_movements WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY occurred_at ASC, created_at ASC`,
    [tenantId],
  );
  return rows
    .map(mapMovement)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.plateNoNormalized || item.plateNoNormalized === input.plateNoNormalized) &&
        (!input?.accessPassId || item.accessPassId === input.accessPassId),
    );
}

export async function getVehicleMovementById(id: string, tenantId?: string | null): Promise<VehicleMovement | null> {
  const row = tenantId
    ? await getDatabase().getFirst<MovementRow>(
        'SELECT * FROM vehicle_movements WHERE id = ? AND tenant_id = ?',
        [id, tenantId],
      )
    : await getDatabase().getFirst<MovementRow>('SELECT * FROM vehicle_movements WHERE id = ?', [id]);
  return row ? mapMovement(row) : null;
}
