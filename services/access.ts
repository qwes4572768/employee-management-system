import type { ActorContext } from './actor';
import { getEffectivePermissionKeys, getEffectiveRoles } from './permissionService';
import { requireActorTenant, requireUserInTenant } from './tenantGuard';
import { getDatabase } from '@/database/runtime';
import { ROLE_KEYS } from '@/constants/app';
import type { User } from '@/types';
import { listRolePermissionKeys } from '@/repositories/permissionRepository';
import { isWithinRange } from '@/utils/datetime';

export async function requireActiveActor(actor: ActorContext): Promise<User> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) throw new Error('缺少操作者，無法驗證權限');
  const user = await requireUserInTenant(actor.userId, tenantId);
  if (user.status !== 'active') throw new Error('帳號未啟用或已停權，請重新登入');
  return user;
}

export async function actorIsSuperAdmin(actor: ActorContext): Promise<boolean> {
  const user = await requireActiveActor(actor);
  return (await getEffectiveRoles(user.id, user.tenantId)).some(r => r.roleKey === ROLE_KEYS.SUPER_ADMIN);
}

export async function requireCanManageUser(actor: ActorContext, userId: string): Promise<void> {
  if (await actorIsSuperAdmin(actor)) return;
  const target = await requireUserInTenant(userId, requireActorTenant(actor));
  const roles = await getEffectiveRoles(target.id, target.tenantId);
  const mine = await actorPermissionKeys(actor);
  const roleKeys = (await Promise.all(roles.map(role => listRolePermissionKeys(role.id, target.tenantId)))).flat();
  const administrativeKeys = new Set(['users.assignRole', 'permissions.update', 'roles.create', 'roles.update', 'roles.delete']);
  const exceedsAuthority = (key: string) => administrativeKeys.has(key) && !mine.includes(key);
  if (roles.some(r => r.roleKey === ROLE_KEYS.SUPER_ADMIN) ||
      roleKeys.some(exceedsAuthority) ||
      (await getEffectivePermissionKeys(target)).some(exceedsAuthority)) {
    throw new Error('不可管理權限高於自己的帳號');
  }
}

// Call inside the same transaction as a role/status mutation.
export async function requirePermanentAdministrator(tenantId: string): Promise<void> {
  const rows = await getDatabase().getAll<{ starts_at: string | null; expires_at: string | null }>(
    `SELECT ur.starts_at, ur.expires_at FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
     JOIN roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
     WHERE u.tenant_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
       AND ur.deleted_at IS NULL AND ur.is_permanent = 1
       AND r.role_key = ? AND r.status = 'active' AND r.deleted_at IS NULL`,
    [tenantId, ROLE_KEYS.SUPER_ADMIN],
  );
  const now = new Date();
  if (!rows.some(row => isWithinRange(now, row.starts_at, row.expires_at, true))) {
    throw new Error('必須保留至少一位有效的永久企業總管理員');
  }
}

export async function requireActorPermission(actor: ActorContext, permKey: string): Promise<string[]> {
  const user = await requireActiveActor(actor);
  const keys = await getEffectivePermissionKeys(user);
  if (!keys.includes(permKey)) {
    throw new Error('沒有此操作權限');
  }
  return keys;
}

export async function actorPermissionKeys(actor: ActorContext): Promise<string[]> {
  const user = await requireActiveActor(actor);
  return getEffectivePermissionKeys(user);
}
