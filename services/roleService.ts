import { getDatabase } from '@/database/runtime';
import { requireActorPermission, actorPermissionKeys, actorIsSuperAdmin, requireCanManageUser, requirePermanentAdministrator } from './access';
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
  await requireActorPermission(actor, 'roles.create');
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
  await requireActorPermission(actor, 'roles.update');
  const tenantId = requireActorTenant(actor);
  const before = await requireRoleInTenant(roleId, tenantId);
  await requireRoleWithinAuthority(actor, before);
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
  await requireActorPermission(actor, 'roles.update');
  const tenantId = requireActorTenant(actor);
  const before = await requireRoleInTenant(roleId, tenantId);
  await requireRoleWithinAuthority(actor, before);
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
  const keys = await requireActorPermission(actor, 'permissions.update');
  const actorTenant = requireActorTenant(actor);
  assertSameTenant(actorTenant, tenantId);
  const role = await requireRoleInTenant(roleId, actorTenant);
  if (role.roleKey === ROLE_KEYS.SUPER_ADMIN) {
    throw new Error('企業總管理員權限不可縮減');
  }
  const before = await listRolePermissionKeys(roleId, actorTenant);
  if (!(await actorIsSuperAdmin(actor)) && [...before, ...permKeys].some(key => !keys.includes(key))) {
    throw new Error('不可設定超過自己授權範圍的角色權限');
  }
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
  await requireActorPermission(actor, 'users.assignRole');
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const user = await requireUserInTenant(input.userId, tenantId);
  const role = await requireRoleInTenant(input.roleId, tenantId);
  await requireCanManageUser(actor, user.id);
  if (role.status !== 'active') throw new Error('不可指派停用角色');
  await requireGrantableRole(actor, role);
  const { record, created } = await getDatabase().withTransaction(async () => {
    const result = await assignUserRole({
      tenantId,
      userId: user.id,
      roleId: role.id,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      isPermanent: input.isPermanent,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    await requirePermanentAdministrator(tenantId);
    return result;
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
  await requireActorPermission(actor, 'users.assignRole');
  const tenantId = requireActorTenant(actor);
  const assignment = await getUserRoleById(assignmentId, tenantId);
  if (!assignment) {
    throw new Error('找不到角色授權');
  }
  await requireCanManageUser(actor, assignment.userId);
  await requireGrantableRole(actor, await requireRoleInTenant(assignment.roleId, tenantId));
  await getDatabase().withTransaction(async () => {
    await revokeUserRole(assignment.id, tenantId);
    await requirePermanentAdministrator(tenantId);
  });
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
  await requireActorPermission(actor, 'permissions.update');
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const user = await requireUserInTenant(input.userId, tenantId);
  await requireCanManageUser(actor, user.id);
  const keys = await requireActorPermission(actor, 'permissions.update');
  if (!keys.includes(input.permKey)) throw new Error('不可設定超過自己授權範圍的個別權限');
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

async function requireGrantableRole(actor: ActorContext, role: Role): Promise<void> {
  await requireActorPermission(actor, 'users.assignRole');
  await requireRoleWithinAuthority(actor, role);
}

export async function listAssignableRoles(actor: ActorContext): Promise<Role[]> {
  const keys = await actorPermissionKeys(actor);
  if (!keys.includes('users.assignRole')) return [];
  const roles = (await listRoles(requireActorTenant(actor))).filter(role => role.status === 'active');
  if (await actorIsSuperAdmin(actor)) return roles;
  const allowed: Role[] = [];
  for (const role of roles) {
    if (role.roleKey !== ROLE_KEYS.SUPER_ADMIN &&
        (await listRolePermissionKeys(role.id, role.tenantId)).every(key => keys.includes(key))) {
      allowed.push(role);
    }
  }
  return allowed;
}

async function requireRoleWithinAuthority(actor: ActorContext, role: Role): Promise<void> {
  if (await actorIsSuperAdmin(actor)) return;
  const keys = await actorPermissionKeys(actor);
  const roleKeys = await listRolePermissionKeys(role.id, role.tenantId);
  if (role.roleKey === ROLE_KEYS.SUPER_ADMIN || roleKeys.some(key => !keys.includes(key))) {
    throw new Error('不可指派或移除權限高於自己的角色');
  }
}

export { listRoles, getRoleById, listRolePermissionKeys, listPermissions, listUserOverrides };

