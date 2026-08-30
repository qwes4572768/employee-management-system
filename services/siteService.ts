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
import {
  getSiteGrantById,
  grantSiteAccess,
  listUserSitePermissions,
  revokeSiteAccess,
} from '@/repositories/userSiteRepository';
import type { Site, SiteStatus, User } from '@/types';
import { formatDateTimeZh, isWithinRange, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getEffectiveRoles } from './permissionService';
import {
  assertSameTenant,
  requireActorTenant,
  requireSiteInTenant,
  requireUserInTenant,
} from './tenantGuard';

export async function createSite(actor: ActorContext, input: Omit<SiteInsert, 'createdBy' | 'deviceId'>) {
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const nameError = required(input.name, '案場名稱');
  const codeError = required(input.siteCode, '案場代碼');
  if (nameError || codeError) {
    throw new Error(nameError ?? codeError ?? '案場資料不完整');
  }
  const duplicated = await getSiteByCode(tenantId, input.siteCode);
  if (duplicated) {
    throw new Error('案場代碼已存在');
  }
  const site = await insertSite({
    ...input,
    tenantId,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  if (actor.userId) {
    await grantSiteAccess({
      tenantId,
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
    actor: { ...actor, tenantId },
    action: 'create',
    module: 'sites',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 建立案場「${site.name}」`,
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
  const tenantId = requireActorTenant(actor);
  const before = await requireSiteInTenant(siteId, tenantId);
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
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 修改案場「${after.name}」`,
    targetType: 'site',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function changeSiteStatus(actor: ActorContext, siteId: string, status: SiteStatus) {
  const tenantId = requireActorTenant(actor);
  const before = await requireSiteInTenant(siteId, tenantId);
  const after = await setSiteStatus(siteId, status);
  const verb = status === 'inactive' ? '停用' : status === 'archived' ? '封存' : '啟用';
  await writeAudit({
    actor,
    action: 'update',
    module: 'sites',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${verb}案場「${after.name}」`,
    targetType: 'site',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export async function getAuthorizedSites(user: User): Promise<Site[]> {
  const roles = await getEffectiveRoles(user.id, user.tenantId);
  const isSuper = roles.some((role) => role.roleKey === ROLE_KEYS.SUPER_ADMIN);
  const all = await listSites(user.tenantId);
  if (isSuper) {
    return all.filter((site) => site.status !== 'archived');
  }
  const grants = await listUserSitePermissions(user.id, user.tenantId);
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
  const tenantId = requireActorTenant(actor);
  assertSameTenant(tenantId, input.tenantId);
  const user = await requireUserInTenant(input.userId, tenantId);
  const site = await requireSiteInTenant(input.siteId, tenantId);
  const { record, created } = await grantSiteAccess({
    tenantId,
    userId: user.id,
    siteId: site.id,
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
    module: 'sites',
    description: created
      ? `${actor.fullName} 於 ${at} 授權「${input.targetName}」使用案場「${input.siteName}」`
      : `${actor.fullName} 於 ${at} 更新「${input.targetName}」的案場「${input.siteName}」授權`,
    targetType: 'user_site_permission',
    targetId: record.id,
    targetDisplayName: input.targetName,
    after: record,
    siteId: site.id,
  });
  return record;
}

export async function removeUserSite(
  actor: ActorContext,
  grantId: string,
  targetName: string,
  siteName: string,
) {
  const tenantId = requireActorTenant(actor);
  const grant = await getSiteGrantById(grantId, tenantId);
  if (!grant) {
    throw new Error('找不到案場授權');
  }
  await revokeSiteAccess(grant.id, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'sites',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 移除「${targetName}」的案場「${siteName}」授權`,
    targetType: 'user_site_permission',
    targetId: grantId,
    targetDisplayName: targetName,
  });
}

export { listSites, getSiteById, listUserSitePermissions };
