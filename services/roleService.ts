import { ROLE_KEYS } from '@/constants/app';
import { permissionIdForKey } from '@/database/migrations';
import {
  assignUserRole,
  getUserRoleById,
  insertPermissionOverride,
  listPermissions,
  listRolePermissionKeys,
  listUserOverrides,
  revokeUserRole,
  setRolePermissions,
} from '@/repositories/permissionRepository';
import { disableRole, getRoleById, insertRole, listRoles, updateRole } from '@/repositories/roleRepository';
import type { EntityStatus, PermissionEffect, Role } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';
import { required } from '@/utils/validation';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import {
  requireActorTenant,
  requireRoleInTenant,
  requireUserInTenant,
  assertSameTenant,
} from './tenantGuard';

export async function createCustomRole(
  actor: ActorContext,
  input: { tenantId: string; name: string; description?: string },
): Promise<Role> {
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const nameError = required(input.name, '角色名稱');
  if (nameError) {
    throw new Error(nameError);
  }
  const role = await insertRole({
    tenantId,
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
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 建立角色「${role.name}」`,
    targetType: 'role',
    targetId: role.id,
    targetDisplayName: role.name,
    after: role,
  });
  return role;
}

export async function renameRole(actor: ActorContext, roleId: string, name: string, description?: string | null) {
  const tenantId = requireActorTenant(actor);
  const before = await requireRoleInTenant(roleId, tenantId);
  const after = await updateRole(roleId, { name, description });
  await writeAudit({
    actor,
    action: 'update',
    module: 'roles',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 將角色名稱由「${before.name}」修改為「${after.name}」`,
    targetType: 'role',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function setRoleStatus(actor: ActorContext, roleId: string, status: EntityStatus) {
  const tenantId = requireActorTenant(actor);
  const before = await requireRoleInTenant(roleId, tenantId);
  if (before.isSystem && status !== 'active') {
    throw new Error('系統角色不可停用');
  }
  const after = status === 'inactive' ? await disableRole(roleId) : await updateRole(roleId, { status });
  await writeAudit({
    actor,
    action: 'update',
    module: 'roles',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${status === 'inactive' ? '停用' : '啟用'}角色「${after.name}」`,
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
  const actorTenant = requireActorTenant(actor);
  assertSameTenant(actorTenant, tenantId);
  const role = await requireRoleInTenant(roleId, actorTenant);
  if (role.roleKey === ROLE_KEYS.SUPER_ADMIN) {
    throw new Error('企業總管理員權限不可縮減');
  }
  const before = await listRolePermissionKeys(roleId, actorTenant);
  await setRolePermissions(actorTenant, roleId, permKeys);
  const after = await listRolePermissionKeys(roleId, actorTenant);
  await writeAudit({
    actor,
    action: 'update',
    module: 'permissions',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 修改角色「${role.name}」權限`,
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
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const user = await requireUserInTenant(input.userId, tenantId);
  const role = await requireRoleInTenant(input.roleId, tenantId);
  const { record, created } = await assignUserRole({
    tenantId,
    userId: user.id,
    roleId: role.id,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isPermanent: input.isPermanent,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const at = formatDateTimeZh(nowIso());
  await writeAudit({
    actor,
    action: created ? 'assign' : 'update',
    module: 'users',
    description: created
      ? `${actor.fullName} 於 ${at} 指派「${input.targetName}」角色為「${input.roleName}」`
      : `${actor.fullName} 於 ${at} 更新「${input.targetName}」的角色「${input.roleName}」授權`,
    targetType: 'user_role',
    targetId: record.id,
    targetDisplayName: input.targetName,
    after: record,
  });
  return record;
}

export async function removeUserRoleAssignment(actor: ActorContext, assignmentId: string, targetName: string) {
  const tenantId = requireActorTenant(actor);
  const assignment = await getUserRoleById(assignmentId, tenantId);
  if (!assignment) {
    throw new Error('找不到角色授權');
  }
  await revokeUserRole(assignment.id, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'users',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 移除「${targetName}」的角色授權`,
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
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const user = await requireUserInTenant(input.userId, tenantId);
  const { record, created } = await insertPermissionOverride({
    tenantId,
    userId: user.id,
    permissionId: permissionIdForKey(input.permKey),
    effect: input.effect,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isPermanent: input.isPermanent,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const at = formatDateTimeZh(nowIso());
  const effectLabel = input.effect === 'allow' ? '允許' : '拒絕';
  await writeAudit({
    actor,
    action: created ? 'assign' : 'update',
    module: 'permissions',
    description: created
      ? `${actor.fullName} 於 ${at} 為「${input.targetName}」設定個別權限 ${input.permKey}（${effectLabel}）`
      : `${actor.fullName} 於 ${at} 更新「${input.targetName}」的個別權限 ${input.permKey} 為「${effectLabel}」`,
    targetType: 'user_permission_override',
    targetId: record.id,
    targetDisplayName: input.targetName,
    after: record,
  });
  return record;
}

export { listRoles, getRoleById, listRolePermissionKeys, listPermissions, listUserOverrides };
