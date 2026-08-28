import { CURRENT_SITE_KEY, ROLE_KEYS } from '@/constants/app';
import { getAppState, setAppState } from '@/repositories/appStateRepository';
import {
  getSiteByCode,
  getSiteById,
  insertSite,
  listSites,
  setSiteStatus,
  updateSite,
  type SiteInsert,
} from '@/repositories/siteRepository';
import { grantSiteAccess, listUserSitePermissions, revokeSiteAccess } from '@/repositories/userSiteRepository';
import type { Site, SiteStatus, User } from '@/types';
import { isWithinRange } from '@/utils/datetime';
import { required } from '@/utils/validation';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getEffectiveRoles } from './permissionService';

export async function createSite(actor: ActorContext, input: Omit<SiteInsert, 'createdBy' | 'deviceId'>) {
  const nameError = required(input.name, '案場名稱');
  const codeError = required(input.siteCode, '案場代碼');
  if (nameError || codeError) {
    throw new Error(nameError ?? codeError ?? '案場資料不完整');
  }
  const duplicated = await getSiteByCode(input.tenantId, input.siteCode);
  if (duplicated) {
    throw new Error('案場代碼已存在');
  }
  const site = await insertSite({
    ...input,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  if (actor.userId) {
    await grantSiteAccess({
      tenantId: input.tenantId,
      userId: actor.userId,
      siteId: site.id,
      startsAt: null,
      expiresAt: null,
      isPermanent: true,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  }
  await writeAudit({
    actor: { ...actor, tenantId: actor.tenantId ?? input.tenantId },
    action: 'create',
    module: 'sites',
    description: `${actor.fullName} 建立案場「${site.name}」`,
    targetType: 'site',
    targetId: site.id,
    targetDisplayName: site.name,
    after: site,
  });
  return site;
}

export async function editSite(
  actor: ActorContext,
  siteId: string,
  patch: Partial<Omit<SiteInsert, 'tenantId' | 'createdBy' | 'deviceId'>>,
) {
  const before = await getSiteById(siteId);
  if (!before) {
    throw new Error('找不到案場');
  }
  if (patch.siteCode && patch.siteCode.trim() !== before.siteCode) {
    const duplicated = await getSiteByCode(before.tenantId, patch.siteCode);
    if (duplicated) {
      throw new Error('案場代碼已存在');
    }
  }
  const after = await updateSite(siteId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'sites',
    description: `${actor.fullName} 修改案場「${after.name}」`,
    targetType: 'site',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function changeSiteStatus(actor: ActorContext, siteId: string, status: SiteStatus) {
  const before = await getSiteById(siteId);
  if (!before) {
    throw new Error('找不到案場');
  }
  const after = await setSiteStatus(siteId, status);
  const verb = status === 'inactive' ? '停用' : status === 'archived' ? '封存' : '啟用';
  await writeAudit({
    actor,
    action: 'update',
    module: 'sites',
    description: `${actor.fullName} ${verb}案場「${after.name}」`,
    targetType: 'site',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function getAuthorizedSites(user: User): Promise<Site[]> {
  const roles = await getEffectiveRoles(user.id);
  const isSuper = roles.some((role) => role.roleKey === ROLE_KEYS.SUPER_ADMIN);
  const all = await listSites(user.tenantId);
  if (isSuper) {
    return all.filter((site) => site.status !== 'archived');
  }
  const grants = await listUserSitePermissions(user.id);
  const now = new Date();
  const allowed = new Set(
    grants
      .filter((grant) => isWithinRange(now, grant.startsAt, grant.expiresAt, grant.isPermanent))
      .map((grant) => grant.siteId),
  );
  return all.filter((site) => allowed.has(site.id) && site.status === 'active');
}

export async function getCurrentSite(user: User): Promise<Site | null> {
  const sites = await getAuthorizedSites(user);
  if (sites.length === 0) {
    return null;
  }
  const stored = await getAppState(`${CURRENT_SITE_KEY}:${user.id}`);
  if (stored) {
    const match = sites.find((site) => site.id === stored);
    if (match) {
      return match;
    }
  }
  return sites[0] ?? null;
}

export async function switchCurrentSite(user: User, siteId: string): Promise<Site> {
  const sites = await getAuthorizedSites(user);
  const match = sites.find((site) => site.id === siteId);
  if (!match) {
    throw new Error('沒有此案場的授權');
  }
  await setAppState(`${CURRENT_SITE_KEY}:${user.id}`, siteId);
  return match;
}

export async function assignUserToSite(
  actor: ActorContext,
  input: {
    tenantId: string;
    userId: string;
    siteId: string;
    startsAt: string | null;
    expiresAt: string | null;
    isPermanent: boolean;
    targetName: string;
    siteName: string;
  },
) {
  const grant = await grantSiteAccess({
    tenantId: input.tenantId,
    userId: input.userId,
    siteId: input.siteId,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isPermanent: input.isPermanent,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'assign',
    module: 'sites',
    description: `${actor.fullName} 授權「${input.targetName}」使用案場「${input.siteName}」`,
    targetType: 'user_site_permission',
    targetId: grant.id,
    targetDisplayName: input.targetName,
    after: grant,
    siteId: input.siteId,
  });
  return grant;
}

export async function removeUserSite(
  actor: ActorContext,
  grantId: string,
  targetName: string,
  siteName: string,
) {
  await revokeSiteAccess(grantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'sites',
    description: `${actor.fullName} 移除「${inputSafe(targetName)}」的案場「${siteName}」授權`,
    targetType: 'user_site_permission',
    targetId: grantId,
    targetDisplayName: targetName,
  });
}

function inputSafe(value: string): string {
  return value;
}

export { listSites, getSiteById, listUserSitePermissions };
