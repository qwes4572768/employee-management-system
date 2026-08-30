import { getDatabase } from '@/database/runtime';
import type { Tenant } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface TenantRow extends SyncRow {
  id: string;
  official_name: string;
  short_name: string;
  tax_id: string | null;
  phone: string | null;
  address: string | null;
  logo_uri: string | null;
  industry_type: string | null;
  status: Tenant['status'];
}

function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    officialName: row.official_name,
    shortName: row.short_name,
    taxId: row.tax_id,
    phone: row.phone,
    address: row.address,
    logoUri: row.logo_uri,
    industryType: row.industry_type,
    status: row.status,
    ...mapSync(row),
  };
}

export interface TenantInsert {
  officialName: string;
  shortName: string;
  taxId?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUri?: string | null;
  industryType?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}

export async function countTenants(): Promise<number> {
  const row = await getDatabase().getFirst<{ c: number }>(
    'SELECT COUNT(*) as c FROM tenants WHERE deleted_at IS NULL',
  );
  return row?.c ?? 0;
}

export async function listTenants(): Promise<Tenant[]> {
  const rows = await getDatabase().getAll<TenantRow>(
    'SELECT * FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC',
  );
  return rows.map(mapTenant);
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const row = await getDatabase().getFirst<TenantRow>(
    'SELECT * FROM tenants WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return row ? mapTenant(row) : null;
}

export async function insertTenant(input: TenantInsert): Promise<Tenant> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO tenants (
      id, official_name, short_name, tax_id, phone, address, logo_uri, industry_type, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.officialName.trim(),
      input.shortName.trim(),
      input.taxId?.trim() || null,
      input.phone?.trim() || null,
      input.address?.trim() || null,
      input.logoUri || null,
      input.industryType || null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getTenantById(id);
  if (!created) {
    throw new Error('建立公司資料失敗');
  }
  return created;
}

export async function updateTenant(
  id: string,
  patch: Partial<Omit<TenantInsert, 'createdBy' | 'deviceId'>>,
): Promise<Tenant> {
  const current = await getTenantById(id);
  if (!current) {
    throw new Error('找不到公司資料');
  }
  const next = {
    officialName: patch.officialName?.trim() ?? current.officialName,
    shortName: patch.shortName?.trim() ?? current.shortName,
    taxId: patch.taxId === undefined ? current.taxId : patch.taxId?.trim() || null,
    phone: patch.phone === undefined ? current.phone : patch.phone?.trim() || null,
    address: patch.address === undefined ? current.address : patch.address?.trim() || null,
    logoUri: patch.logoUri === undefined ? current.logoUri : patch.logoUri,
    industryType: patch.industryType === undefined ? current.industryType : patch.industryType,
  };
  await getDatabase().run(
    `UPDATE tenants SET
      official_name = ?, short_name = ?, tax_id = ?, phone = ?, address = ?, logo_uri = ?,
      industry_type = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [
      next.officialName,
      next.shortName,
      next.taxId,
      next.phone,
      next.address,
      next.logoUri,
      next.industryType,
      nowIso(),
      id,
    ],
  );
  const updated = await getTenantById(id);
  if (!updated) {
    throw new Error('更新公司資料失敗');
  }
  return updated;
}
