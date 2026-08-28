import type { ActorContext } from './actor';
import { getEffectivePermissionKeys } from './permissionService';
import { requireActorTenant, requireUserInTenant } from './tenantGuard';

export async function requireActorPermission(actor: ActorContext, permKey: string): Promise<string[]> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) {
    throw new Error('缺少操作者，無法驗證權限');
  }
  const user = await requireUserInTenant(actor.userId, tenantId);
  const keys = await getEffectivePermissionKeys(user);
  if (!keys.includes(permKey)) {
    throw new Error('沒有此操作權限');
  }
  return keys;
}

export async function actorPermissionKeys(actor: ActorContext): Promise<string[]> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) return [];
  const user = await requireUserInTenant(actor.userId, tenantId);
  return getEffectivePermissionKeys(user);
}
