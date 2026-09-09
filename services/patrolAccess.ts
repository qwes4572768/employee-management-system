import type { ActorContext } from './actor';
import { actorPermissionKeys } from './access';
import { requireActorTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';
import { getAuthorizedSites } from './siteService';

export async function actorCanAccessSiteId(actor: ActorContext, siteId: string): Promise<boolean> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) return false;
  const user = await requireUserInTenant(actor.userId, tenantId);
  const sites = await getAuthorizedSites(user);
  return sites.some((site) => site.id === siteId);
}

export async function requireActorSiteAccess(actor: ActorContext, siteId: string): Promise<void> {
  if (!(await actorCanAccessSiteId(actor, siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
}

export async function requireTenantRecord<T extends { tenantId: string }>(
  record: T | null,
  tenantId: string,
  fallback: () => Promise<T | null>,
  missing: string,
): Promise<T> {
  if (record) return record;
  const other = await fallback();
  if (other) throw new TenantAccessError();
  throw new Error(missing);
}

export async function actorHasAnyPermission(actor: ActorContext, keys: string[]): Promise<boolean> {
  const have = await actorPermissionKeys(actor);
  return keys.some((key) => have.includes(key));
}
