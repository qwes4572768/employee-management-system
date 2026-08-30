import { getRoleById } from '@/repositories/roleRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getUserById } from '@/repositories/userRepository';
import type { Role, Site, User } from '@/types';

import type { ActorContext } from './actor';

export const TENANT_ISOLATION_MESSAGE = '無權存取其他公司的資料';

export class TenantAccessError extends Error {
  readonly code = 'TENANT_ISOLATION';

  constructor(message = TENANT_ISOLATION_MESSAGE) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

export function requireActorTenant(actor: ActorContext): string {
  if (!actor.tenantId) {
    throw new TenantAccessError('缺少公司識別，無法存取資料');
  }
  return actor.tenantId;
}

export function assertSameTenant(
  expectedTenantId: string | null | undefined,
  actualTenantId: string | null | undefined,
): void {
  if (!expectedTenantId || !actualTenantId || expectedTenantId !== actualTenantId) {
    throw new TenantAccessError();
  }
}

export async function requireUserInTenant(userId: string, tenantId: string): Promise<User> {
  const user = await getUserById(userId, tenantId);
  if (!user) {
    const existing = await getUserById(userId);
    if (existing) {
      throw new TenantAccessError();
    }
    throw new Error('找不到帳號');
  }
  return user;
}

export async function requireRoleInTenant(roleId: string, tenantId: string): Promise<Role> {
  const role = await getRoleById(roleId, tenantId);
  if (!role) {
    const existing = await getRoleById(roleId);
    if (existing) {
      throw new TenantAccessError();
    }
    throw new Error('找不到角色');
  }
  return role;
}

export async function requireSiteInTenant(siteId: string, tenantId: string): Promise<Site> {
  const site = await getSiteById(siteId, tenantId);
  if (!site) {
    const existing = await getSiteById(siteId);
    if (existing) {
      throw new TenantAccessError();
    }
    throw new Error('找不到案場');
  }
  return site;
}

export async function requireActorUser(actor: ActorContext, userId: string): Promise<User> {
  const tenantId = requireActorTenant(actor);
  return requireUserInTenant(userId, tenantId);
}
