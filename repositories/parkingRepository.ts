import { getDatabase } from '@/database/runtime';
import type {
  ParkingAssignmentType,
  ParkingOccupancySource,
  ParkingOccupancyStatus,
  ParkingSpaceStatus,
  ParkingSpaceType,
  ParkingVehicleType,
  ParkingViolationSeverity,
  ParkingViolationStatus,
  ParkingViolationType,
} from '@/constants/mobility';
import type {
  ParkingAssignment,
  ParkingOccupancy,
  ParkingSpace,
  ParkingViolation,
  SiteParkingSettings,
} from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface SpaceRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  zone: string | null;
  floor: string | null;
  space_no: string;
  display_name: string;
  space_type: ParkingSpaceType;
  vehicle_type: ParkingVehicleType;
  status: ParkingSpaceStatus;
  notes: string | null;
}

interface AssignmentRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  parking_space_id: string;
  unit_id: string | null;
  resident_id: string | null;
  assignment_type: ParkingAssignmentType;
  starts_at: string | null;
  ends_at: string | null;
  is_current: number;
  notes: string | null;
}

interface SettingsRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  visitor_max_duration_minutes: number;
  temporary_max_duration_minutes: number;
}

interface OccupancyRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  parking_space_id: string;
  vehicle_id: string | null;
  access_pass_id: string | null;
  plate_no_snapshot: string;
  occupied_from: string;
  occupied_until: string | null;
  status: ParkingOccupancyStatus;
  source: ParkingOccupancySource;
  confidence: number | null;
  capture_image_uri: string | null;
}

interface ViolationRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  parking_space_id: string | null;
  vehicle_id: string | null;
  occupancy_id: string | null;
  plate_no_snapshot: string;
  violation_type: ParkingViolationType;
  severity: ParkingViolationSeverity;
  description: string | null;
  status: ParkingViolationStatus;
  reported_by: string | null;
  reported_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  photo_uri: string | null;
}

function mapSpace(row: SpaceRow): ParkingSpace {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    zone: row.zone,
    floor: row.floor,
    spaceNo: row.space_no,
    displayName: row.display_name,
    spaceType: row.space_type,
    vehicleType: row.vehicle_type,
    status: row.status,
    notes: row.notes,
    ...mapSync(row),
  };
}

function mapAssignment(row: AssignmentRow): ParkingAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    parkingSpaceId: row.parking_space_id,
    unitId: row.unit_id,
    residentId: row.resident_id,
    assignmentType: row.assignment_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isCurrent: boolFromSql(row.is_current),
    notes: row.notes,
    ...mapSync(row),
  };
}

function mapSettings(row: SettingsRow): SiteParkingSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    visitorMaxDurationMinutes: row.visitor_max_duration_minutes,
    temporaryMaxDurationMinutes: row.temporary_max_duration_minutes,
    ...mapSync(row),
  };
}

function mapOccupancy(row: OccupancyRow): ParkingOccupancy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    parkingSpaceId: row.parking_space_id,
    vehicleId: row.vehicle_id,
    accessPassId: row.access_pass_id,
    plateNoSnapshot: row.plate_no_snapshot,
    occupiedFrom: row.occupied_from,
    occupiedUntil: row.occupied_until,
    status: row.status,
    source: row.source,
    confidence: row.confidence,
    captureImageUri: row.capture_image_uri,
    ...mapSync(row),
  };
}

function mapViolation(row: ViolationRow): ParkingViolation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    parkingSpaceId: row.parking_space_id,
    vehicleId: row.vehicle_id,
    occupancyId: row.occupancy_id,
    plateNoSnapshot: row.plate_no_snapshot,
    violationType: row.violation_type,
    severity: row.severity,
    description: row.description,
    status: row.status,
    reportedBy: row.reported_by,
    reportedAt: row.reported_at,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    photoUri: row.photo_uri,
    ...mapSync(row),
  };
}

export async function insertParkingSpace(input: {
  tenantId: string;
  siteId: string;
  zone?: string | null;
  floor?: string | null;
  spaceNo: string;
  displayName: string;
  spaceType: ParkingSpaceType;
  vehicleType?: ParkingVehicleType;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ParkingSpace> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO parking_spaces (
      id, tenant_id, site_id, zone, floor, space_no, display_name, space_type, vehicle_type, status, notes,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.zone ?? null,
      input.floor ?? null,
      input.spaceNo,
      input.displayName,
      input.spaceType,
      input.vehicleType ?? 'car',
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getParkingSpaceById(id, input.tenantId);
  if (!created) throw new Error('建立車位失敗');
  return created;
}

export async function getParkingSpaceById(id: string, tenantId?: string | null): Promise<ParkingSpace | null> {
  const row = tenantId
    ? await getDatabase().getFirst<SpaceRow>(
        'SELECT * FROM parking_spaces WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<SpaceRow>('SELECT * FROM parking_spaces WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapSpace(row) : null;
}

export async function listParkingSpaces(
  tenantId: string,
  input?: { siteId?: string | null; status?: ParkingSpaceStatus | null },
): Promise<ParkingSpace[]> {
  const rows = await getDatabase().getAll<SpaceRow>(
    `SELECT * FROM parking_spaces WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY display_name`,
    [tenantId],
  );
  return rows
    .map(mapSpace)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status),
    );
}

export async function updateParkingSpace(
  id: string,
  tenantId: string,
  patch: Partial<Pick<ParkingSpace, 'zone' | 'floor' | 'spaceNo' | 'displayName' | 'spaceType' | 'vehicleType' | 'status' | 'notes'>>,
): Promise<ParkingSpace> {
  const current = await getParkingSpaceById(id, tenantId);
  if (!current) throw new Error('找不到車位');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE parking_spaces SET
      zone = ?, floor = ?, space_no = ?, display_name = ?, space_type = ?, vehicle_type = ?, status = ?, notes = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.zone === undefined ? current.zone : patch.zone,
      patch.floor === undefined ? current.floor : patch.floor,
      patch.spaceNo ?? current.spaceNo,
      patch.displayName ?? current.displayName,
      patch.spaceType ?? current.spaceType,
      patch.vehicleType ?? current.vehicleType,
      patch.status ?? current.status,
      patch.notes === undefined ? current.notes : patch.notes,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getParkingSpaceById(id, tenantId);
  if (!updated) throw new Error('更新車位失敗');
  return updated;
}

export async function insertParkingAssignment(input: {
  tenantId: string;
  siteId: string;
  parkingSpaceId: string;
  unitId?: string | null;
  residentId?: string | null;
  assignmentType: ParkingAssignmentType;
  startsAt?: string | null;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ParkingAssignment> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO parking_assignments (
      id, tenant_id, site_id, parking_space_id, unit_id, resident_id, assignment_type,
      starts_at, ends_at, is_current, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.parkingSpaceId,
      input.unitId ?? null,
      input.residentId ?? null,
      input.assignmentType,
      input.startsAt ?? ts,
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getParkingAssignmentById(id, input.tenantId);
  if (!row) throw new Error('建立車位指派失敗');
  return row;
}

export async function getParkingAssignmentById(id: string, tenantId?: string | null): Promise<ParkingAssignment | null> {
  const row = tenantId
    ? await getDatabase().getFirst<AssignmentRow>(
        'SELECT * FROM parking_assignments WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<AssignmentRow>(
        'SELECT * FROM parking_assignments WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapAssignment(row) : null;
}

export async function listParkingAssignments(
  tenantId: string,
  input?: { parkingSpaceId?: string | null; unitId?: string | null; currentOnly?: boolean },
): Promise<ParkingAssignment[]> {
  const rows = await getDatabase().getAll<AssignmentRow>(
    `SELECT * FROM parking_assignments WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_current DESC, created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapAssignment)
    .filter(
      (item) =>
        (!input?.parkingSpaceId || item.parkingSpaceId === input.parkingSpaceId) &&
        (!input?.unitId || item.unitId === input.unitId) &&
        (!input?.currentOnly || item.isCurrent),
    );
}

export async function endParkingAssignment(id: string, tenantId: string, endsAt: string): Promise<void> {
  await getDatabase().run(
    `UPDATE parking_assignments SET is_current = 0, ends_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [endsAt, nowIso(), id, tenantId],
  );
}

export async function getSiteParkingSettings(tenantId: string, siteId: string): Promise<SiteParkingSettings | null> {
  const row = await getDatabase().getFirst<SettingsRow>(
    'SELECT * FROM site_parking_settings WHERE tenant_id = ? AND site_id = ? AND deleted_at IS NULL',
    [tenantId, siteId],
  );
  return row ? mapSettings(row) : null;
}

export async function upsertSiteParkingSettings(input: {
  tenantId: string;
  siteId: string;
  visitorMaxDurationMinutes: number;
  temporaryMaxDurationMinutes: number;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<SiteParkingSettings> {
  const existing = await getSiteParkingSettings(input.tenantId, input.siteId);
  const ts = nowIso();
  if (existing) {
    await getDatabase().run(
      `UPDATE site_parking_settings SET visitor_max_duration_minutes = ?, temporary_max_duration_minutes = ?,
        updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ? AND tenant_id = ?`,
      [input.visitorMaxDurationMinutes, input.temporaryMaxDurationMinutes, ts, existing.id, input.tenantId],
    );
    const updated = await getSiteParkingSettings(input.tenantId, input.siteId);
    if (!updated) throw new Error('更新臨停設定失敗');
    return updated;
  }
  const id = createId();
  await getDatabase().run(
    `INSERT INTO site_parking_settings (
      id, tenant_id, site_id, visitor_max_duration_minutes, temporary_max_duration_minutes,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.visitorMaxDurationMinutes,
      input.temporaryMaxDurationMinutes,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getSiteParkingSettings(input.tenantId, input.siteId);
  if (!created) throw new Error('建立臨停設定失敗');
  return created;
}

export async function insertParkingOccupancy(input: {
  tenantId: string;
  siteId: string;
  parkingSpaceId: string;
  vehicleId?: string | null;
  accessPassId?: string | null;
  plateNoSnapshot: string;
  occupiedFrom: string;
  status?: ParkingOccupancyStatus;
  source?: ParkingOccupancySource;
  confidence?: number | null;
  captureImageUri?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ParkingOccupancy> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO parking_occupancies (
      id, tenant_id, site_id, parking_space_id, vehicle_id, access_pass_id, plate_no_snapshot,
      occupied_from, occupied_until, status, source, confidence, capture_image_uri,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.parkingSpaceId,
      input.vehicleId ?? null,
      input.accessPassId ?? null,
      input.plateNoSnapshot,
      input.occupiedFrom,
      input.status ?? 'occupied',
      input.source ?? 'guard',
      input.confidence ?? null,
      input.captureImageUri ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getParkingOccupancyById(id, input.tenantId);
  if (!created) throw new Error('建立占用失敗');
  return created;
}

export async function getParkingOccupancyById(id: string, tenantId?: string | null): Promise<ParkingOccupancy | null> {
  const row = tenantId
    ? await getDatabase().getFirst<OccupancyRow>(
        'SELECT * FROM parking_occupancies WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<OccupancyRow>(
        'SELECT * FROM parking_occupancies WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapOccupancy(row) : null;
}

export async function listParkingOccupancies(
  tenantId: string,
  input?: { siteId?: string | null; parkingSpaceId?: string | null; openOnly?: boolean },
): Promise<ParkingOccupancy[]> {
  const rows = await getDatabase().getAll<OccupancyRow>(
    `SELECT * FROM parking_occupancies WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY occupied_from DESC`,
    [tenantId],
  );
  return rows
    .map(mapOccupancy)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.parkingSpaceId || item.parkingSpaceId === input.parkingSpaceId) &&
        (!input?.openOnly || item.occupiedUntil == null),
    );
}

export async function updateParkingOccupancy(
  id: string,
  tenantId: string,
  patch: Partial<Pick<ParkingOccupancy, 'occupiedUntil' | 'status'>>,
): Promise<ParkingOccupancy> {
  const current = await getParkingOccupancyById(id, tenantId);
  if (!current) throw new Error('找不到占用紀錄');
  await getDatabase().run(
    `UPDATE parking_occupancies SET occupied_until = ?, status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.occupiedUntil === undefined ? current.occupiedUntil : patch.occupiedUntil,
      patch.status ?? current.status,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getParkingOccupancyById(id, tenantId);
  if (!updated) throw new Error('更新占用失敗');
  return updated;
}

export async function insertParkingViolation(input: {
  tenantId: string;
  siteId: string;
  parkingSpaceId?: string | null;
  vehicleId?: string | null;
  occupancyId?: string | null;
  plateNoSnapshot: string;
  violationType: ParkingViolationType;
  severity?: ParkingViolationSeverity;
  description?: string | null;
  reportedBy: string | null;
  reportedAt: string;
  photoUri?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ParkingViolation> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO parking_violations (
      id, tenant_id, site_id, parking_space_id, vehicle_id, occupancy_id, plate_no_snapshot,
      violation_type, severity, description, status, reported_by, reported_at, resolved_by, resolved_at, resolution_note, photo_uri,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.parkingSpaceId ?? null,
      input.vehicleId ?? null,
      input.occupancyId ?? null,
      input.plateNoSnapshot,
      input.violationType,
      input.severity ?? 'general',
      input.description ?? null,
      input.reportedBy,
      input.reportedAt,
      input.photoUri ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getParkingViolationById(id, input.tenantId);
  if (!created) throw new Error('建立違停紀錄失敗');
  return created;
}

export async function getParkingViolationById(id: string, tenantId?: string | null): Promise<ParkingViolation | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ViolationRow>(
        'SELECT * FROM parking_violations WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<ViolationRow>(
        'SELECT * FROM parking_violations WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapViolation(row) : null;
}

export async function listParkingViolations(
  tenantId: string,
  input?: { siteId?: string | null; status?: ParkingViolationStatus | null },
): Promise<ParkingViolation[]> {
  const rows = await getDatabase().getAll<ViolationRow>(
    `SELECT * FROM parking_violations WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY reported_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapViolation)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status),
    );
}

export async function updateParkingViolation(
  id: string,
  tenantId: string,
  patch: Partial<Pick<ParkingViolation, 'status' | 'resolvedBy' | 'resolvedAt' | 'resolutionNote'>>,
): Promise<ParkingViolation> {
  const current = await getParkingViolationById(id, tenantId);
  if (!current) throw new Error('找不到違停紀錄');
  await getDatabase().run(
    `UPDATE parking_violations SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.status ?? current.status,
      patch.resolvedBy === undefined ? current.resolvedBy : patch.resolvedBy,
      patch.resolvedAt === undefined ? current.resolvedAt : patch.resolvedAt,
      patch.resolutionNote === undefined ? current.resolutionNote : patch.resolutionNote,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getParkingViolationById(id, tenantId);
  if (!updated) throw new Error('更新違停失敗');
  return updated;
}

export { sqlBool };
