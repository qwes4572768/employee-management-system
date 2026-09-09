import { getDatabase } from '@/database/runtime';
import type { EntityStatus, Role } from '@/types';
import { boolFromSql } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface RoleRow extends SyncRow {
  id: string;
  tenant_id: string;
  role_key: string;
  name: string;
  description: string | null;
  is_system: number;
  status: EntityStatus;
}

function mapRole(row: RoleRow): Role {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    roleKey: row.role_key,
    name: row.name,
    description: row.description,
    isSystem: boolFromSql(row.is_system),
    status: row.status,
    ...mapSync(row),
  };
}

export async function insertRole(input: {
  tenantId: string;
  roleKey: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<Role> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO roles (
      id, tenant_id, role_key, name, description, is_system, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.roleKey,
      input.name.trim(),
      input.description ?? null,
      input.isSystem ? 1 : 0,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getRoleById(id);
  if (!created) {
    throw new Error('建立角色失敗');
  }
  return created;
}

export async function getRoleById(id: string, tenantId?: string | null): Promise<Role | null> {
  const row = tenantId
    ? await getDatabase().getFirst<RoleRow>(
        'SELECT * FROM roles WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<RoleRow>(
        'SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapRole(row) : null;
}

export async function getRoleByKey(tenantId: string, roleKey: string): Promise<Role | null> {
  const row = await getDatabase().getFirst<RoleRow>(
    'SELECT * FROM roles WHERE tenant_id = ? AND role_key = ? AND deleted_at IS NULL',
    [tenantId, roleKey],
  );
  return row ? mapRole(row) : null;
}

export async function listRoles(tenantId: string): Promise<Role[]> {
  const rows = await getDatabase().getAll<RoleRow>(
    'SELECT * FROM roles WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_system DESC, created_at ASC',
    [tenantId],
  );
  return rows.map(mapRole);
}

export async function updateRole(
  id: string,
  patch: { name?: string; description?: string | null; status?: EntityStatus },
): Promise<Role> {
  const current = await getRoleById(id);
  if (!current) {
    throw new Error('找不到角色');
  }
  await getDatabase().run(
    `UPDATE roles SET name = ?, description = ?, status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [
      patch.name?.trim() ?? current.name,
      patch.description === undefined ? current.description : patch.description,
      patch.status ?? current.status,
      nowIso(),
      id,
    ],
  );
  const updated = await getRoleById(id);
  if (!updated) {
    throw new Error('更新角色失敗');
  }
  return updated;
}

export async function disableRole(id: string): Promise<Role> {
  return updateRole(id, { status: 'inactive' });
}
