import { getDatabase } from '@/database/runtime';
import type { OccupancyType, UnitStatus } from '@/constants/community';
import type { SiteUnit } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface UnitRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  building: string | null;
  floor: string | null;
  unit_no: string;
  display_name: string;
  occupancy_type: OccupancyType;
  status: UnitStatus;
  notes: string | null;
}

function mapUnit(row: UnitRow): SiteUnit {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    building: row.building,
    floor: row.floor,
    unitNo: row.unit_no,
    displayName: row.display_name,
    occupancyType: row.occupancy_type,
    status: row.status,
    notes: row.notes,
    ...mapSync(row),
  };
}

export async function insertSiteUnit(input: {
  tenantId: string;
  siteId: string;
  building?: string | null;
  floor?: string | null;
  unitNo: string;
  displayName: string;
  occupancyType?: OccupancyType;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<SiteUnit> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO site_units (
      id, tenant_id, site_id, building, floor, unit_no, display_name, occupancy_type, status, notes,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.building ?? null,
      input.floor ?? null,
      input.unitNo,
      input.displayName,
      input.occupancyType ?? 'vacant',
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getSiteUnitById(id, input.tenantId);
  if (!created) throw new Error('建立戶別失敗');
  return created;
}

export async function getSiteUnitById(id: string, tenantId?: string | null): Promise<SiteUnit | null> {
  const row = tenantId
    ? await getDatabase().getFirst<UnitRow>(
        'SELECT * FROM site_units WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<UnitRow>('SELECT * FROM site_units WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapUnit(row) : null;
}

export async function listSiteUnits(
  tenantId: string,
  input?: { siteId?: string | null; status?: UnitStatus | null },
): Promise<SiteUnit[]> {
  const rows = await getDatabase().getAll<UnitRow>(
    `SELECT * FROM site_units WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY building, floor, unit_no`,
    [tenantId],
  );
  return rows
    .map(mapUnit)
    .filter((item) => (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status));
}

export async function updateSiteUnit(
  id: string,
  tenantId: string,
  patch: Partial<Pick<SiteUnit, 'building' | 'floor' | 'unitNo' | 'displayName' | 'occupancyType' | 'status' | 'notes'>>,
): Promise<SiteUnit> {
  const current = await getSiteUnitById(id, tenantId);
  if (!current) throw new Error('找不到戶別');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE site_units SET
      building = ?, floor = ?, unit_no = ?, display_name = ?, occupancy_type = ?, status = ?, notes = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.building === undefined ? current.building : patch.building,
      patch.floor === undefined ? current.floor : patch.floor,
      patch.unitNo ?? current.unitNo,
      patch.displayName ?? current.displayName,
      patch.occupancyType ?? current.occupancyType,
      patch.status ?? current.status,
      patch.notes === undefined ? current.notes : patch.notes,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getSiteUnitById(id, tenantId);
  if (!updated) throw new Error('更新戶別失敗');
  return updated;
}
