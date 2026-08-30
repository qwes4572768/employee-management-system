import { ROLE_KEYS } from '@/constants/app';
import {
  listAllPermissionKeys,
  listPermissions,
  listRolePermissionKeys,
  listUserOverrides,
  listUserRoles,
} from '@/repositories/permissionRepository';
import { getRoleById, listRoles } from '@/repositories/roleRepository';
import type { Role, User } from '@/types';
import { isWithinRange } from '@/utils/datetime';

export async function getEffectiveRoles(userId: string, tenantId: string): Promise<Role[]> {
  const assignments = await listUserRoles(userId, tenantId);
  const now = new Date();
  const roles: Role[] = [];
  for (const assignment of assignments) {
    if (assignment.tenantId !== tenantId) {
      continue;
    }
    if (!isWithinRange(now, assignment.startsAt, assignment.expiresAt, assignment.isPermanent)) {
      continue;
    }
    const role = await getRoleById(assignment.roleId, tenantId);
    if (role && role.status === 'active' && role.tenantId === tenantId) {
      roles.push(role);
    }
  }
  return roles;
}

export async function getEffectivePermissionKeys(user: User): Promise<string[]> {
  const roles = await getEffectiveRoles(user.id, user.tenantId);
  if (roles.some((role) => role.roleKey === ROLE_KEYS.SUPER_ADMIN)) {
    return listAllPermissionKeys();
  }

  const granted = new Set<string>();
  for (const role of roles) {
    const keys = await listRolePermissionKeys(role.id, user.tenantId);
    keys.forEach((key) => granted.add(key));
  }

  const overrides = await listUserOverrides(user.id, user.tenantId);
  const now = new Date();
  const all = await listPermissions();
  const byId = new Map(all.map((item) => [item.id, item.permKey]));
  for (const override of overrides) {
    if (override.tenantId !== user.tenantId) {
      continue;
    }
    if (!isWithinRange(now, override.startsAt, override.expiresAt, override.isPermanent)) {
      continue;
    }
    const key = byId.get(override.permissionId);
    if (!key) {
      continue;
    }
    if (override.effect === 'allow') {
      granted.add(key);
    } else {
      granted.delete(key);
    }
  }

  return Array.from(granted);
}

export function hasPermission(permissionKeys: string[], required: string): boolean {
  return permissionKeys.includes(required);
}

export function hasAnyPermission(permissionKeys: string[], required: string[]): boolean {
  return required.some((key) => permissionKeys.includes(key));
}

export async function roleSnapshotForUser(userId: string, tenantId: string): Promise<string> {
  const roles = await getEffectiveRoles(userId, tenantId);
  if (roles.length === 0) {
    return 'NONE';
  }
  return roles.map((role) => role.name).join('、');
}

export async function tenantRoleNames(tenantId: string): Promise<Role[]> {
  return listRoles(tenantId);
}
