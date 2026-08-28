import { getDatabase } from '@/database/runtime';
import type { Site, SiteStatus } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface SiteRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_code: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius: number | null;
  require_gps: number;
  require_site_qr: number;
  status: SiteStatus;
  starts_at: string | null;
  expires_at: string | null;
}

function mapSite(row: SiteRow): Site {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteCode: row.site_code,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    attendanceRadius: row.attendance_radius,
    requireGps: boolFromSql(row.require_gps),
    requireSiteQr: boolFromSql(row.require_site_qr),
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    ...mapSync(row),
  };
}

export interface SiteInsert {
  tenantId: string;
  siteCode: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attendanceRadius?: number | null;
  requireGps?: boolean;
  requireSiteQr?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}

export async function insertSite(input: SiteInsert): Promise<Site> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO sites (
      id, tenant_id, site_code, name, address, latitude, longitude, attendance_radius,
      require_gps, require_site_qr, status, starts_at, expires_at,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteCode.trim(),
      input.name.trim(),
      input.address?.trim() || null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.attendanceRadius ?? null,
      sqlBool(input.requireGps ?? false),
      sqlBool(input.requireSiteQr ?? false),
      input.startsAt ?? null,
      input.expiresAt ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getSiteById(id);
  if (!created) {
    throw new Error('建立案場失敗');
  }
  return created;
}

export async function getSiteById(id: string): Promise<Site | null> {
  const row = await getDatabase().getFirst<SiteRow>(
    'SELECT * FROM sites WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return row ? mapSite(row) : null;
}

export async function listSites(tenantId: string): Promise<Site[]> {
  const rows = await getDatabase().getAll<SiteRow>(
    `SELECT * FROM sites WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 ELSE 2 END, created_at DESC`,
    [tenantId],
  );
  return rows.map(mapSite);
}

export async function updateSite(
  id: string,
  patch: Partial<Omit<SiteInsert, 'tenantId' | 'createdBy' | 'deviceId'>>,
): Promise<Site> {
  const current = await getSiteById(id);
  if (!current) {
    throw new Error('找不到案場');
  }
  await getDatabase().run(
    `UPDATE sites SET
      site_code = ?, name = ?, address = ?, latitude = ?, longitude = ?, attendance_radius = ?,
      require_gps = ?, require_site_qr = ?, starts_at = ?, expires_at = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [
      patch.siteCode?.trim() ?? current.siteCode,
      patch.name?.trim() ?? current.name,
      patch.address === undefined ? current.address : patch.address?.trim() || null,
      patch.latitude === undefined ? current.latitude : patch.latitude,
      patch.longitude === undefined ? current.longitude : patch.longitude,
      patch.attendanceRadius === undefined ? current.attendanceRadius : patch.attendanceRadius,
      sqlBool(patch.requireGps ?? current.requireGps),
      sqlBool(patch.requireSiteQr ?? current.requireSiteQr),
      patch.startsAt === undefined ? current.startsAt : patch.startsAt,
      patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt,
      nowIso(),
      id,
    ],
  );
  const updated = await getSiteById(id);
  if (!updated) {
    throw new Error('更新案場失敗');
  }
  return updated;
}

export async function setSiteStatus(id: string, status: SiteStatus): Promise<Site> {
  await getDatabase().run(
    `UPDATE sites SET status = ?, updated_at = ?, version = version + 1, sync_status = 'pending' WHERE id = ?`,
    [status, nowIso(), id],
  );
  const updated = await getSiteById(id);
  if (!updated) {
    throw new Error('更新案場狀態失敗');
  }
  return updated;
}

export async function getSiteByCode(tenantId: string, siteCode: string): Promise<Site | null> {
  const row = await getDatabase().getFirst<SiteRow>(
    'SELECT * FROM sites WHERE tenant_id = ? AND site_code = ? AND deleted_at IS NULL',
    [tenantId, siteCode.trim()],
  );
  return row ? mapSite(row) : null;
}
