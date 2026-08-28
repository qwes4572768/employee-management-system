import { getDatabase } from '@/database/runtime';
import type { EntityStatus, UserSitePermission } from '@/types';
import { boolFromSql } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

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

export async function grantSiteAccess(input: {
  tenantId: string;
  userId: string;
  siteId: string;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<UserSitePermission> {
  const existing = await getDatabase().getFirst<Row>(
    `SELECT * FROM user_site_permissions
     WHERE user_id = ? AND site_id = ? AND deleted_at IS NULL`,
    [input.userId, input.siteId],
  );
  if (existing) {
    await getDatabase().run(
      `UPDATE user_site_permissions SET
        starts_at = ?, expires_at = ?, is_permanent = ?, status = 'active',
        updated_at = ?, version = version + 1, sync_status = 'pending', deleted_at = NULL
       WHERE id = ?`,
      [input.startsAt, input.expiresAt, input.isPermanent ? 1 : 0, nowIso(), existing.id],
    );
    const updated = await getDatabase().getFirst<Row>(
      'SELECT * FROM user_site_permissions WHERE id = ?',
      [existing.id],
    );
    if (!updated) {
      throw new Error('更新案場授權失敗');
    }
    return mapRow(updated);
  }

  const id = createId();
  const ts = nowIso();
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
  return mapRow(created);
}

export async function revokeSiteAccess(id: string): Promise<void> {
  await getDatabase().run(
    `UPDATE user_site_permissions SET
      status = 'inactive', deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [nowIso(), nowIso(), id],
  );
}

export async function listUserSitePermissions(userId: string): Promise<UserSitePermission[]> {
  const rows = await getDatabase().getAll<Row>(
    `SELECT * FROM user_site_permissions WHERE user_id = ? AND deleted_at IS NULL AND status = 'active'`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function listSiteUserPermissions(siteId: string): Promise<UserSitePermission[]> {
  const rows = await getDatabase().getAll<Row>(
    `SELECT * FROM user_site_permissions WHERE site_id = ? AND deleted_at IS NULL AND status = 'active'`,
    [siteId],
  );
  return rows.map(mapRow);
}
