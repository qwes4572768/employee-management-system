import { getDatabase } from '@/database/runtime';
import type { ResidentRelationKey, ResidentStatus } from '@/constants/community';
import type { Resident, ResidentOccupancy } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface ResidentRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  full_name: string;
  phone: string | null;
  gender: string;
  id_last4: string | null;
  photo_uri: string | null;
  move_in_at: string | null;
  move_out_at: string | null;
  status: ResidentStatus;
  notes: string | null;
}

interface OccupancyRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  unit_id: string;
  resident_id: string;
  relation_key: ResidentRelationKey;
  relation_label_snapshot: string;
  starts_at: string | null;
  ends_at: string | null;
  is_current: number;
  is_primary?: number;
  notes: string | null;
}

function mapResident(row: ResidentRow): Resident {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    fullName: row.full_name,
    phone: row.phone,
    gender: row.gender,
    idLast4: row.id_last4,
    photoUri: row.photo_uri,
    moveInAt: row.move_in_at,
    moveOutAt: row.move_out_at,
    status: row.status,
    notes: row.notes,
    ...mapSync(row),
  };
}

function mapOccupancy(row: OccupancyRow): ResidentOccupancy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    unitId: row.unit_id,
    residentId: row.resident_id,
    relationKey: row.relation_key,
    relationLabelSnapshot: row.relation_label_snapshot,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isCurrent: boolFromSql(row.is_current),
    isPrimary: boolFromSql(row.is_primary),
    notes: row.notes,
    ...mapSync(row),
  };
}

export async function insertResident(input: {
  tenantId: string;
  siteId: string;
  fullName: string;
  phone?: string | null;
  gender?: string;
  idLast4?: string | null;
  photoUri?: string | null;
  moveInAt?: string | null;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<Resident> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO residents (
      id, tenant_id, site_id, full_name, phone, gender, id_last4, photo_uri,
      move_in_at, move_out_at, status, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.fullName,
      input.phone ?? null,
      input.gender ?? 'unspecified',
      input.idLast4 ?? null,
      input.photoUri ?? null,
      input.moveInAt ?? null,
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getResidentById(id, input.tenantId);
  if (!created) throw new Error('建立住戶失敗');
  return created;
}

export async function getResidentById(id: string, tenantId?: string | null): Promise<Resident | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ResidentRow>(
        'SELECT * FROM residents WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<ResidentRow>('SELECT * FROM residents WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapResident(row) : null;
}

export async function listResidents(
  tenantId: string,
  input?: { siteId?: string | null; unitId?: string | null; status?: ResidentStatus | null; currentOccupancyOnly?: boolean },
): Promise<Resident[]> {
  const rows = await getDatabase().getAll<ResidentRow>(
    `SELECT * FROM residents WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY full_name`,
    [tenantId],
  );
  let items = rows.map(mapResident);
  if (input?.siteId) items = items.filter((item) => item.siteId === input.siteId);
  if (input?.status) items = items.filter((item) => item.status === input.status);
  if (input?.unitId) {
    const occupancies = await listResidentOccupancies(tenantId, {
      unitId: input.unitId,
      currentOnly: input.currentOccupancyOnly ?? true,
    });
    const ids = new Set(occupancies.map((item) => item.residentId));
    items = items.filter((item) => ids.has(item.id));
  }
  return items;
}

export async function updateResident(
  id: string,
  tenantId: string,
  patch: Partial<Pick<Resident, 'fullName' | 'phone' | 'gender' | 'idLast4' | 'photoUri' | 'moveInAt' | 'moveOutAt' | 'status' | 'notes'>>,
): Promise<Resident> {
  const current = await getResidentById(id, tenantId);
  if (!current) throw new Error('找不到住戶');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE residents SET
      full_name = ?, phone = ?, gender = ?, id_last4 = ?, photo_uri = ?,
      move_in_at = ?, move_out_at = ?, status = ?, notes = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.fullName ?? current.fullName,
      patch.phone === undefined ? current.phone : patch.phone,
      patch.gender ?? current.gender,
      patch.idLast4 === undefined ? current.idLast4 : patch.idLast4,
      patch.photoUri === undefined ? current.photoUri : patch.photoUri,
      patch.moveInAt === undefined ? current.moveInAt : patch.moveInAt,
      patch.moveOutAt === undefined ? current.moveOutAt : patch.moveOutAt,
      patch.status ?? current.status,
      patch.notes === undefined ? current.notes : patch.notes,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getResidentById(id, tenantId);
  if (!updated) throw new Error('更新住戶失敗');
  return updated;
}

export async function insertResidentOccupancy(input: {
  tenantId: string;
  siteId: string;
  unitId: string;
  residentId: string;
  relationKey: ResidentRelationKey;
  relationLabelSnapshot: string;
  startsAt?: string | null;
  endsAt?: string | null;
  isCurrent?: boolean;
  isPrimary?: boolean;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ResidentOccupancy> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO resident_occupancies (
      id, tenant_id, site_id, unit_id, resident_id, relation_key, relation_label_snapshot,
      starts_at, ends_at, is_current, is_primary, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.unitId,
      input.residentId,
      input.relationKey,
      input.relationLabelSnapshot,
      input.startsAt ?? null,
      input.endsAt ?? null,
      sqlBool(input.isCurrent ?? true),
      sqlBool(input.isPrimary ?? false),
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<OccupancyRow>(
    'SELECT * FROM resident_occupancies WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('建立住戶關係失敗');
  return mapOccupancy(row);
}

export async function getResidentOccupancyById(
  id: string,
  tenantId?: string | null,
): Promise<ResidentOccupancy | null> {
  const row = tenantId
    ? await getDatabase().getFirst<OccupancyRow>(
        'SELECT * FROM resident_occupancies WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<OccupancyRow>(
        'SELECT * FROM resident_occupancies WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapOccupancy(row) : null;
}

export async function listResidentOccupancies(
  tenantId: string,
  input?: { unitId?: string | null; residentId?: string | null; currentOnly?: boolean },
): Promise<ResidentOccupancy[]> {
  const rows = await getDatabase().getAll<OccupancyRow>(
    `SELECT * FROM resident_occupancies WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_current DESC, created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapOccupancy)
    .filter(
      (item) =>
        (!input?.unitId || item.unitId === input.unitId) &&
        (!input?.residentId || item.residentId === input.residentId) &&
        (!input?.currentOnly || item.isCurrent),
    );
}

export async function hasCurrentOccupancy(tenantId: string, residentId: string, unitId: string): Promise<boolean> {
  const rows = await listResidentOccupancies(tenantId, { residentId, unitId, currentOnly: true });
  return rows.length > 0;
}

export async function endResidentOccupancy(id: string, tenantId: string, endsAt: string): Promise<void> {
  await getDatabase().run(
    `UPDATE resident_occupancies SET is_current = 0, ends_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [endsAt, nowIso(), id, tenantId],
  );
}
