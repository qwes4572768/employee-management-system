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
    await db.run('DELETE FROM role_permissions WHERE role_id = ? AND tenant_id = ?', [roleId, tenantId]);
    const ts = nowIso();
    for (const key of permKeys) {
      await db.run(
        'INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [createId(), tenantId, roleId, permissionIdForKey(key), ts],
      );
    }
  });
}

export async function listRolePermissionKeys(roleId: string, tenantId?: string | null): Promise<string[]> {
  const rows = tenantId
    ? await getDatabase().getAll<{ perm_key: string }>(
        `SELECT p.perm_key FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         INNER JOIN roles r ON r.id = rp.role_id
         WHERE rp.role_id = ? AND rp.tenant_id = ? AND r.tenant_id = ?`,
        [roleId, tenantId, tenantId],
      )
    : await getDatabase().getAll<{ perm_key: string }>(
        `SELECT p.perm_key FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?`,
        [roleId],
      );
  return rows.map((row) => row.perm_key);
}

export interface GrantWriteResult<T> {
  record: T;
  created: boolean;
}

export async function getUserRoleById(id: string, tenantId?: string | null): Promise<UserRole | null> {
  const row = tenantId
    ? await getDatabase().getFirst<UserRoleRow>(
        'SELECT * FROM user_roles WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<UserRoleRow>(
        'SELECT * FROM user_roles WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapUserRole(row) : null;
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
}): Promise<GrantWriteResult<UserRole>> {
  const existing = await getDatabase().getFirst<UserRoleRow>(
    `SELECT * FROM user_roles
     WHERE tenant_id = ? AND user_id = ? AND role_id = ? AND deleted_at IS NULL`,
    [input.tenantId, input.userId, input.roleId],
  );
  const ts = nowIso();
  if (existing) {
    await getDatabase().run(
      `UPDATE user_roles SET
        starts_at = ?, expires_at = ?, is_permanent = ?,
        updated_at = ?, version = version + 1, sync_status = 'pending', deleted_at = NULL
       WHERE id = ? AND tenant_id = ?`,
      [input.startsAt, input.expiresAt, input.isPermanent ? 1 : 0, ts, existing.id, input.tenantId],
    );
    const updated = await getDatabase().getFirst<UserRoleRow>('SELECT * FROM user_roles WHERE id = ?', [
      existing.id,
    ]);
    if (!updated) {
      throw new Error('更新角色授權失敗');
    }
    return { record: mapUserRole(updated), created: false };
  }

  const id = createId();
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
  return { record: mapUserRole(row), created: true };
}

export async function listUserRoles(userId: string, tenantId?: string | null): Promise<UserRole[]> {
  const rows = tenantId
    ? await getDatabase().getAll<UserRoleRow>(
        'SELECT * FROM user_roles WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL',
        [tenantId, userId],
      )
    : await getDatabase().getAll<UserRoleRow>(
        'SELECT * FROM user_roles WHERE user_id = ? AND deleted_at IS NULL',
        [userId],
      );
  return rows.map(mapUserRole);
}

export async function revokeUserRole(id: string, tenantId?: string | null): Promise<void> {
  const ts = nowIso();
  if (tenantId) {
    await getDatabase().run(
      `UPDATE user_roles SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ? AND tenant_id = ?`,
      [ts, ts, id, tenantId],
    );
    return;
  }
  await getDatabase().run(
    `UPDATE user_roles SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending' WHERE id = ?`,
    [ts, ts, id],
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
}): Promise<GrantWriteResult<UserPermissionOverride>> {
  const existing = await getDatabase().getFirst<OverrideRow>(
    `SELECT * FROM user_permission_overrides
     WHERE tenant_id = ? AND user_id = ? AND permission_id = ? AND deleted_at IS NULL`,
    [input.tenantId, input.userId, input.permissionId],
  );
  const ts = nowIso();
  if (existing) {
    await getDatabase().run(
      `UPDATE user_permission_overrides SET
        effect = ?, starts_at = ?, expires_at = ?, is_permanent = ?,
        updated_at = ?, version = version + 1, sync_status = 'pending', deleted_at = NULL
       WHERE id = ? AND tenant_id = ?`,
      [
        input.effect,
        input.startsAt,
        input.expiresAt,
        input.isPermanent ? 1 : 0,
        ts,
        existing.id,
        input.tenantId,
      ],
    );
    const updated = await getDatabase().getFirst<OverrideRow>(
      'SELECT * FROM user_permission_overrides WHERE id = ?',
      [existing.id],
    );
    if (!updated) {
      throw new Error('更新個別權限失敗');
    }
    return { record: mapOverride(updated), created: false };
  }

  const id = createId();
  await getDatabase().run(
    `INSERT INTO user_permission_overrides (
      id, tenant_id, user_id, permission_id, effect, starts_at, expires_at, is_permanent,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
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
  return { record: mapOverride(row), created: true };
}

export async function listUserOverrides(
  userId: string,
  tenantId?: string | null,
): Promise<UserPermissionOverride[]> {
  const rows = tenantId
    ? await getDatabase().getAll<OverrideRow>(
        'SELECT * FROM user_permission_overrides WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL',
        [tenantId, userId],
      )
    : await getDatabase().getAll<OverrideRow>(
        'SELECT * FROM user_permission_overrides WHERE user_id = ? AND deleted_at IS NULL',
        [userId],
      );
  return rows.map(mapOverride);
}

export async function countActiveUserRoles(userId: string, roleId: string, tenantId: string): Promise<number> {
  const row = await getDatabase().getFirst<{ c: number }>(
    `SELECT COUNT(*) as c FROM user_roles
     WHERE tenant_id = ? AND user_id = ? AND role_id = ? AND deleted_at IS NULL`,
    [tenantId, userId, roleId],
  );
  return row?.c ?? 0;
}

export async function countActiveOverrides(
  userId: string,
  permissionId: string,
  tenantId: string,
): Promise<number> {
  const row = await getDatabase().getFirst<{ c: number }>(
    `SELECT COUNT(*) as c FROM user_permission_overrides
     WHERE tenant_id = ? AND user_id = ? AND permission_id = ? AND deleted_at IS NULL`,
    [tenantId, userId, permissionId],
  );
  return row?.c ?? 0;
}

export async function listAllPermissionKeys(): Promise<string[]> {
  const rows = await getDatabase().getAll<{ perm_key: string }>('SELECT perm_key FROM permissions');
  return rows.map((row) => row.perm_key);
}
