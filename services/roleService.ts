import { ROLE_KEYS } from '@/constants/app';
import { permissionIdForKey } from '@/database/migrations';
import {
  assignUserRole,
  insertPermissionOverride,
  listPermissions,
  listRolePermissionKeys,
  listUserOverrides,
  revokeUserRole,
  setRolePermissions,
} from '@/repositories/permissionRepository';
import { disableRole, getRoleById, insertRole, listRoles, updateRole } from '@/repositories/roleRepository';
import type { EntityStatus, PermissionEffect, Role } from '@/types';
import { createId } from '@/utils/id';
import { required } from '@/utils/validation';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';

export async function createCustomRole(
  actor: ActorContext,
  input: { tenantId: string; name: string; description?: string },
): Promise<Role> {
  const nameError = required(input.name, '角色名稱');
  if (nameError) {
    throw new Error(nameError);
  }
  const role = await insertRole({
    tenantId: input.tenantId,
    roleKey: `CUSTOM_${createId().slice(0, 8).toUpperCase()}`,
    name: input.name,
    description: input.description ?? null,
    isSystem: false,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'roles',
    description: `${actor.fullName} 建立角色「${role.name}」`,
    targetType: 'role',
    targetId: role.id,
    targetDisplayName: role.name,
    after: role,
  });
  return role;
}

export async function renameRole(actor: ActorContext, roleId: string, name: string, description?: string | null) {
  const before = await getRoleById(roleId);
  if (!before) {
    throw new Error('找不到角色');
  }
  const after = await updateRole(roleId, { name, description });
  await writeAudit({
    actor,
    action: 'update',
    module: 'roles',
    description: `${actor.fullName} 將角色名稱由「${before.name}」修改為「${after.name}」`,
    targetType: 'role',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function setRoleStatus(actor: ActorContext, roleId: string, status: EntityStatus) {
  const before = await getRoleById(roleId);
  if (!before) {
    throw new Error('找不到角色');
  }
  if (before.isSystem && status !== 'active') {
    throw new Error('系統角色不可停用');
  }
  const after = status === 'inactive' ? await disableRole(roleId) : await updateRole(roleId, { status });
  await writeAudit({
    actor,
    action: 'update',
    module: 'roles',
    description: `${actor.fullName} ${status === 'inactive' ? '停用' : '啟用'}角色「${after.name}」`,
    targetType: 'role',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function updateRolePermissionSet(
  actor: ActorContext,
  tenantId: string,
  roleId: string,
  permKeys: string[],
) {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new Error('找不到角色');
  }
  if (role.roleKey === ROLE_KEYS.SUPER_ADMIN) {
    throw new Error('企業總管理員權限不可縮減');
  }
  const before = await listRolePermissionKeys(roleId);
  await setRolePermissions(tenantId, roleId, permKeys);
  const after = await listRolePermissionKeys(roleId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'permissions',
    description: `${actor.fullName} 修改角色「${role.name}」權限`,
    targetType: 'role',
    targetId: role.id,
    targetDisplayName: role.name,
    before,
    after,
  });
}

export async function assignRoleToUser(
  actor: ActorContext,
  input: {
    tenantId: string;
    userId: string;
    roleId: string;
    startsAt: string | null;
    expiresAt: string | null;
    isPermanent: boolean;
    targetName: string;
    roleName: string;
  },
) {
  const assignment = await assignUserRole({
    tenantId: input.tenantId,
    userId: input.userId,
    roleId: input.roleId,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isPermanent: input.isPermanent,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'users',
    description: `${actor.fullName} 指派「${input.targetName}」角色為「${input.roleName}」`,
    targetType: 'user_role',
    targetId: assignment.id,
    targetDisplayName: input.targetName,
    after: assignment,
  });
  return assignment;
}

export async function removeUserRoleAssignment(actor: ActorContext, assignmentId: string, targetName: string) {
  await revokeUserRole(assignmentId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'users',
    description: `${actor.fullName} 移除「${targetName}」的角色授權`,
    targetType: 'user_role',
    targetId: assignmentId,
    targetDisplayName: targetName,
  });
}

export async function addUserPermissionOverride(
  actor: ActorContext,
  input: {
    tenantId: string;
    userId: string;
    permKey: string;
    effect: PermissionEffect;
    startsAt: string | null;
    expiresAt: string | null;
    isPermanent: boolean;
    targetName: string;
  },
) {
  const override = await insertPermissionOverride({
    tenantId: input.tenantId,
    userId: input.userId,
    permissionId: permissionIdForKey(input.permKey),
    effect: input.effect,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isPermanent: input.isPermanent,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'permissions',
    description: `${actor.fullName} 為「${input.targetName}」設定個別權限 ${input.permKey}`,
    targetType: 'user_permission_override',
    targetId: override.id,
    targetDisplayName: input.targetName,
    after: override,
  });
  return override;
}

export { listRoles, getRoleById, listRolePermissionKeys, listPermissions, listUserOverrides };
