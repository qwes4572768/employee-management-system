import { getDatabase } from '@/database/runtime';
import type { EntityStatus, UserSitePermission } from '@/types';
import { boolFromSql } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';
import type { GrantWriteResult } from './permissionRepository';

interface Row extends SyncRow {
  id: string;
  tenant_id: string;
  user_id: string;
  site_id: string;
  starts_at: string | null;
  expires_at: string | null;
  is_permanent: number;
  status: EntityStatus;
}

function mapRow(row: Row): UserSitePermission {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    siteId: row.site_id,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isPermanent: boolFromSql(row.is_permanent),
    status: row.status,
    ...mapSync(row),
  };
}

export async function getSiteGrantById(id: string, tenantId?: string | null): Promise<UserSitePermission | null> {
  const row = tenantId
    ? await getDatabase().getFirst<Row>(
        'SELECT * FROM user_site_permissions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<Row>(
        'SELECT * FROM user_site_permissions WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapRow(row) : null;
}

export async function grantSiteAccess(input: {
  tenantId: string;
  userId: string;
  siteId: string;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<GrantWriteResult<UserSitePermission>> {
  const existing = await getDatabase().getFirst<Row>(
    `SELECT * FROM user_site_permissions
     WHERE tenant_id = ? AND user_id = ? AND site_id = ? AND deleted_at IS NULL`,
    [input.tenantId, input.userId, input.siteId],
  );
  const ts = nowIso();
  if (existing) {
    await getDatabase().run(
      `UPDATE user_site_permissions SET
        starts_at = ?, expires_at = ?, is_permanent = ?, status = 'active',
        updated_at = ?, version = version + 1, sync_status = 'pending', deleted_at = NULL
       WHERE id = ? AND tenant_id = ?`,
      [input.startsAt, input.expiresAt, input.isPermanent ? 1 : 0, ts, existing.id, input.tenantId],
    );
    const updated = await getDatabase().getFirst<Row>(
      'SELECT * FROM user_site_permissions WHERE id = ?',
      [existing.id],
    );
    if (!updated) {
      throw new Error('更新案場授權失敗');
    }
    return { record: mapRow(updated), created: false };
  }

  const id = createId();
  await getDatabase().run(
    `INSERT INTO user_site_permissions (
      id, tenant_id, user_id, site_id, starts_at, expires_at, is_permanent, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.userId,
      input.siteId,
      input.startsAt,
      input.expiresAt,
      input.isPermanent ? 1 : 0,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getDatabase().getFirst<Row>('SELECT * FROM user_site_permissions WHERE id = ?', [
    id,
  ]);
  if (!created) {
    throw new Error('建立案場授權失敗');
  }
  return { record: mapRow(created), created: true };
}

export async function revokeSiteAccess(id: string, tenantId?: string | null): Promise<void> {
  const ts = nowIso();
  if (tenantId) {
    await getDatabase().run(
      `UPDATE user_site_permissions SET
        status = 'inactive', deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ? AND tenant_id = ?`,
      [ts, ts, id, tenantId],
    );
    return;
  }
  await getDatabase().run(
    `UPDATE user_site_permissions SET
      status = 'inactive', deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [ts, ts, id],
  );
}

export async function listUserSitePermissions(
  userId: string,
  tenantId?: string | null,
): Promise<UserSitePermission[]> {
  const rows = tenantId
    ? await getDatabase().getAll<Row>(
        `SELECT * FROM user_site_permissions
         WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL AND status = 'active'`,
        [tenantId, userId],
      )
    : await getDatabase().getAll<Row>(
        `SELECT * FROM user_site_permissions WHERE user_id = ? AND deleted_at IS NULL AND status = 'active'`,
        [userId],
      );
  return rows.map(mapRow);
}

export async function listSiteUserPermissions(
  siteId: string,
  tenantId?: string | null,
): Promise<UserSitePermission[]> {
  const rows = tenantId
    ? await getDatabase().getAll<Row>(
        `SELECT * FROM user_site_permissions
         WHERE tenant_id = ? AND site_id = ? AND deleted_at IS NULL AND status = 'active'`,
        [tenantId, siteId],
      )
    : await getDatabase().getAll<Row>(
        `SELECT * FROM user_site_permissions WHERE site_id = ? AND deleted_at IS NULL AND status = 'active'`,
        [siteId],
      );
  return rows.map(mapRow);
}

export async function countActiveSiteGrants(
  userId: string,
  siteId: string,
  tenantId: string,
): Promise<number> {
  const row = await getDatabase().getFirst<{ c: number }>(
    `SELECT COUNT(*) as c FROM user_site_permissions
     WHERE tenant_id = ? AND user_id = ? AND site_id = ? AND deleted_at IS NULL AND status = 'active'`,
    [tenantId, userId, siteId],
  );
  return row?.c ?? 0;
}
