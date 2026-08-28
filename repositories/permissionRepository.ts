import { getDatabase } from '@/database/runtime';
import { permissionIdForKey } from '@/database/migrations';
import type { Permission, PermissionEffect, UserPermissionOverride, UserRole } from '@/types';
import { boolFromSql } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface PermissionRow {
  id: string;
  perm_key: string;
  module: string;
  action: string;
  name: string;
  description: string | null;
}

interface UserRoleRow extends SyncRow {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  starts_at: string | null;
  expires_at: string | null;
  is_permanent: number;
}

interface OverrideRow extends SyncRow {
  id: string;
  tenant_id: string;
  user_id: string;
  permission_id: string;
  effect: PermissionEffect;
  starts_at: string | null;
  expires_at: string | null;
  is_permanent: number;
}

function mapPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    permKey: row.perm_key,
    module: row.module,
    action: row.action,
    name: row.name,
    description: row.description,
  };
}

function mapUserRole(row: UserRoleRow): UserRole {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    roleId: row.role_id,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isPermanent: boolFromSql(row.is_permanent),
    ...mapSync(row),
  };
}

function mapOverride(row: OverrideRow): UserPermissionOverride {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    permissionId: row.permission_id,
    effect: row.effect,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isPermanent: boolFromSql(row.is_permanent),
    ...mapSync(row),
  };
}

export async function listPermissions(): Promise<Permission[]> {
  const rows = await getDatabase().getAll<PermissionRow>(
    'SELECT * FROM permissions ORDER BY module ASC, action ASC',
  );
  return rows.map(mapPermission);
}

export async function getPermissionByKey(permKey: string): Promise<Permission | null> {
  const row = await getDatabase().getFirst<PermissionRow>(
    'SELECT * FROM permissions WHERE perm_key = ?',
    [permKey],
  );
  return row ? mapPermission(row) : null;
}

export async function setRolePermissions(
  tenantId: string,
  roleId: string,
  permKeys: string[],
): Promise<void> {
  const db = getDatabase();
  await db.withTransaction(async () => {
    await db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    const ts = nowIso();
    for (const key of permKeys) {
      await db.run(
        'INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [createId(), tenantId, roleId, permissionIdForKey(key), ts],
      );
    }
  });
}

export async function listRolePermissionKeys(roleId: string): Promise<string[]> {
  const rows = await getDatabase().getAll<{ perm_key: string }>(
    `SELECT p.perm_key FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [roleId],
  );
  return rows.map((row) => row.perm_key);
}

export async function assignUserRole(input: {
  tenantId: string;
  userId: string;
  roleId: string;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<UserRole> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO user_roles (
      id, tenant_id, user_id, role_id, starts_at, expires_at, is_permanent,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.userId,
      input.roleId,
      input.startsAt,
      input.expiresAt,
      input.isPermanent ? 1 : 0,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<UserRoleRow>('SELECT * FROM user_roles WHERE id = ?', [id]);
  if (!row) {
    throw new Error('指派角色失敗');
  }
  return mapUserRole(row);
}

export async function listUserRoles(userId: string): Promise<UserRole[]> {
  const rows = await getDatabase().getAll<UserRoleRow>(
    'SELECT * FROM user_roles WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  return rows.map(mapUserRole);
}

export async function revokeUserRole(id: string): Promise<void> {
  await getDatabase().run(
    `UPDATE user_roles SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending' WHERE id = ?`,
    [nowIso(), nowIso(), id],
  );
}

export async function insertPermissionOverride(input: {
  tenantId: string;
  userId: string;
  permissionId: string;
  effect: PermissionEffect;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<UserPermissionOverride> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO user_permission_overrides (
      id, tenant_id, user_id, permission_id, effect, starts_at, expires_at, is_permanent,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.userId,
      input.permissionId,
      input.effect,
      input.startsAt,
      input.expiresAt,
      input.isPermanent ? 1 : 0,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<OverrideRow>(
    'SELECT * FROM user_permission_overrides WHERE id = ?',
    [id],
  );
  if (!row) {
    throw new Error('建立個別權限失敗');
  }
  return mapOverride(row);
}

export async function listUserOverrides(userId: string): Promise<UserPermissionOverride[]> {
  const rows = await getDatabase().getAll<OverrideRow>(
    'SELECT * FROM user_permission_overrides WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  return rows.map(mapOverride);
}

export async function listAllPermissionKeys(): Promise<string[]> {
  const rows = await getDatabase().getAll<{ perm_key: string }>('SELECT perm_key FROM permissions');
  return rows.map((row) => row.perm_key);
}
