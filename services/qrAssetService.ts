import { QR_ASSET_TYPE_LABELS, QR_ASSET_TYPES, QR_PHASE_COMPLETE_TYPES, type QrAssetType } from '@/constants/qr';
import {
  deactivateQrAsset,
  getActiveQrAssetForTarget,
  getQrAssetById,
  insertQrAsset,
  listQrAssets,
  reactivateQrAsset,
} from '@/repositories/qrAssetRepository';
import { getPatrolPointById } from '@/repositories/patrolPointRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getTenantById } from '@/repositories/tenantRepository';
import { getUserById, listUsersByTenant } from '@/repositories/userRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import type { QrAsset, User } from '@/types';
import { formatDateTimeZh, isWithinRange, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';
import { buildQrPayload } from '@/utils/qrPayload';

import { actorPermissionKeys, requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorTenant, requireSiteInTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';
import { getAuthorizedSites } from './siteService';

export interface QrAssetListItem extends QrAsset {
  createdByName: string | null;
  lastScanAt: string | null;
}

async function requireQrAssetInTenant(id: string, tenantId: string): Promise<QrAsset> {
  const asset = await getQrAssetById(id, tenantId);
  if (!asset) {
    const existing = await getQrAssetById(id);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到 QR 資產');
  }
  return asset;
}

async function actorUser(actor: ActorContext): Promise<User> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) throw new Error('缺少操作者');
  return requireUserInTenant(actor.userId, tenantId);
}

export async function actorCanAccessTargetUser(actor: ActorContext, target: User): Promise<boolean> {
  const tenantId = requireActorTenant(actor);
  if (target.tenantId !== tenantId) return false;
  if (actor.userId === target.id) return true;
  const scanner = await actorUser(actor);
  const sites = await getAuthorizedSites(scanner);
  const grants = await listUserSitePermissions(target.id, tenantId);
  const now = new Date();
  const targetSiteIds = new Set(
    grants
      .filter((grant) => isWithinRange(now, grant.startsAt, grant.expiresAt, grant.isPermanent))
      .map((grant) => grant.siteId),
  );
  return sites.some((site) => targetSiteIds.has(site.id));
}

export async function actorCanAccessSite(actor: ActorContext, siteId: string): Promise<boolean> {
  const tenantId = requireActorTenant(actor);
  const scanner = await actorUser(actor);
  const sites = await getAuthorizedSites(scanner);
  if (sites.some((site) => site.id === siteId)) return true;
  const site = await getSiteById(siteId, tenantId);
  return Boolean(site && sites.some((item) => item.id === site.id));
}

async function assertCanViewAsset(actor: ActorContext, asset: QrAsset): Promise<void> {
  const keys = await actorPermissionKeys(actor);
  if (asset.assetType === QR_ASSET_TYPES.EMPLOYEE) {
    if (asset.targetId === actor.userId && keys.includes('employeeQr.viewOwn')) return;
    if (!keys.includes('qrAsset.view')) throw new Error('沒有此操作權限');
    const user = await requireUserInTenant(asset.targetId, asset.tenantId);
    if (!(await actorCanAccessTargetUser(actor, user))) {
      throw new Error('您沒有權限查看此人員');
    }
    return;
  }
  if (!keys.includes('qrAsset.view')) throw new Error('沒有此操作權限');
  if (asset.siteId && !(await actorCanAccessSite(actor, asset.siteId))) {
    throw new Error('您沒有權限查看此資產');
  }
}

export async function listQrAssetsForActor(
  actor: ActorContext,
  input?: { assetType?: QrAssetType | 'all' | null; query?: string | null },
): Promise<QrAssetListItem[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'qrAsset.view');
  const type = !input?.assetType || input.assetType === 'all' ? null : input.assetType;
  const rows = await listQrAssets(tenantId, { assetType: type });
  const users = await listUsersByTenant(tenantId);
  const userById = new Map(users.map((item) => [item.id, item]));
  const visible: QrAssetListItem[] = [];
  for (const asset of rows) {
    try {
      await assertCanViewAsset(actor, asset);
    } catch {
      continue;
    }
    const creator = asset.createdBy ? userById.get(asset.createdBy) ?? (await getUserById(asset.createdBy, tenantId)) : null;
    visible.push({
      ...asset,
      createdByName: creator?.fullName ?? null,
      lastScanAt: asset.lastScanAt,
    });
  }
  const q = input?.query?.trim().toLowerCase();
  if (!q) return visible;
  return visible.filter((item) => {
    const user = item.assetType === QR_ASSET_TYPES.EMPLOYEE ? userById.get(item.targetId) : null;
    const siteName = item.assetType === QR_ASSET_TYPES.SITE ? item.displayName : '';
    return (
      item.displayName.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.qrCode.toLowerCase().includes(q) ||
      (user?.employeeNo ?? '').toLowerCase().includes(q) ||
      (user?.fullName ?? '').toLowerCase().includes(q) ||
      siteName.toLowerCase().includes(q)
    );
  });
}

export async function getQrAssetForViewer(actor: ActorContext, id: string): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  const asset = await requireQrAssetInTenant(id, tenantId);
  await assertCanViewAsset(actor, asset);
  return asset;
}

export async function getOwnEmployeeQr(actor: ActorContext): Promise<QrAsset | null> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'employeeQr.viewOwn');
  if (!actor.userId) throw new Error('缺少操作者');
  return getActiveQrAssetForTarget(tenantId, QR_ASSET_TYPES.EMPLOYEE, actor.userId);
}

async function issueQr(
  actor: ActorContext,
  input: {
    assetType: QrAssetType;
    targetId: string;
    siteId?: string | null;
    displayName: string;
    regenerate?: boolean;
  },
): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'qrAsset.create');
  if (!QR_PHASE_COMPLETE_TYPES.includes(input.assetType)) {
    throw new Error(`${QR_ASSET_TYPE_LABELS[input.assetType]}將於後續階段建立，本階段僅支援人員、案場與巡邏點 QR`);
  }
  const existing = await getActiveQrAssetForTarget(tenantId, input.assetType, input.targetId);
  if (existing && !input.regenerate) {
    throw new Error('此對象已有有效的永久 QR，請先停用或改為重新產生');
  }
  if (existing && input.regenerate) {
    await requireActorPermission(actor, 'qrAsset.deactivate');
    const old = await deactivateQrAsset(existing.id, tenantId, {
      deactivatedBy: actor.userId,
      reason: '重新製作',
    });
    await writeAudit({
      actor,
      action: 'update',
      module: 'qrAsset',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 重新產生「${old.displayName}」的${QR_ASSET_TYPE_LABELS[old.assetType]}，舊 QR 已停用。`,
      targetType: 'qr_asset',
      targetId: old.id,
      targetDisplayName: old.displayName,
      before: old,
      siteId: old.siteId,
    });
  }

  let created: QrAsset;
  try {
    created = await insertQrAsset({
      tenantId,
      siteId: input.siteId ?? null,
      assetType: input.assetType,
      targetType: input.assetType,
      targetId: input.targetId,
      qrCode: buildQrPayload(),
      displayName: input.displayName,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) {
      throw new Error('QR 代碼重複或此對象已有有效 QR');
    }
    throw error;
  }
  await writeAudit({
    actor,
    action: 'create',
    module: 'qrAsset',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 建立「${created.displayName}」的${QR_ASSET_TYPE_LABELS[created.assetType]}。`,
    targetType: 'qr_asset',
    targetId: created.id,
    targetDisplayName: created.displayName,
    after: created,
    siteId: created.siteId,
  });
  return created;
}

export async function issueEmployeeQr(actor: ActorContext, userId: string, regenerate = false): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  const user = await requireUserInTenant(userId, tenantId);
  if (!(await actorCanAccessTargetUser(actor, user))) {
    throw new Error('您沒有權限為此人員建立 QR');
  }
  const grants = await listUserSitePermissions(user.id, tenantId);
  return issueQr(actor, {
    assetType: QR_ASSET_TYPES.EMPLOYEE,
    targetId: user.id,
    siteId: grants[0]?.siteId ?? actor.siteId ?? null,
    displayName: user.fullName,
    regenerate,
  });
}

export async function issueSiteQr(actor: ActorContext, siteId: string, regenerate = false): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  const site = await requireSiteInTenant(siteId, tenantId);
  if (!(await actorCanAccessSite(actor, site.id))) {
    throw new Error('您沒有權限為此案場建立 QR');
  }
  return issueQr(actor, {
    assetType: QR_ASSET_TYPES.SITE,
    targetId: site.id,
    siteId: site.id,
    displayName: site.name,
    regenerate,
  });
}

export async function issuePatrolPointQr(
  actor: ActorContext,
  pointId: string,
  regenerate = false,
): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  const point = await getPatrolPointById(pointId, tenantId);
  if (!point) {
    const existing = await getPatrolPointById(pointId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到巡邏點');
  }
  if (!(await actorCanAccessSite(actor, point.siteId))) {
    throw new Error('您沒有權限為此巡邏點建立 QR');
  }
  return issueQr(actor, {
    assetType: QR_ASSET_TYPES.PATROL_POINT,
    targetId: point.id,
    siteId: point.siteId,
    displayName: point.name,
    regenerate,
  });
}

export async function deactivateQrAssetByActor(
  actor: ActorContext,
  id: string,
  reason: string,
): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'qrAsset.deactivate');
  const reasonError = required(reason, '停用原因');
  if (reasonError) throw new Error(reasonError);
  const before = await requireQrAssetInTenant(id, tenantId);
  await assertCanViewAsset(actor, before);
  if (before.status === 'inactive') throw new Error('此 QR 已停用');
  const after = await deactivateQrAsset(id, tenantId, { deactivatedBy: actor.userId, reason: reason.trim() });
  await writeAudit({
    actor,
    action: 'update',
    module: 'qrAsset',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 停用「${after.displayName}」的${QR_ASSET_TYPE_LABELS[after.assetType]}，原因：${reason.trim()}。`,
    targetType: 'qr_asset',
    targetId: after.id,
    targetDisplayName: after.displayName,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function reactivateQrAssetByActor(actor: ActorContext, id: string): Promise<QrAsset> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'qrAsset.reactivate');
  const before = await requireQrAssetInTenant(id, tenantId);
  await assertCanViewAsset(actor, before);
  const other = await getActiveQrAssetForTarget(tenantId, before.targetType, before.targetId);
  if (other && other.id !== before.id) {
    throw new Error('此對象已有另一張有效 QR，請先停用後再重新啟用');
  }
  const after = await reactivateQrAsset(id, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'qrAsset',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 重新啟用「${after.displayName}」的${QR_ASSET_TYPE_LABELS[after.assetType]}。`,
    targetType: 'qr_asset',
    targetId: after.id,
    targetDisplayName: after.displayName,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function getEmployeeQrCard(actor: ActorContext, userId?: string) {
  const tenantId = requireActorTenant(actor);
  const targetId = userId ?? actor.userId;
  if (!targetId) throw new Error('缺少人員');
  const user = await requireUserInTenant(targetId, tenantId);
  const keys = await actorPermissionKeys(actor);
  if (user.id === actor.userId) {
    await requireActorPermission(actor, 'employeeQr.viewOwn');
  } else if (!keys.includes('qrAsset.view')) {
    throw new Error('沒有此操作權限');
  } else if (!(await actorCanAccessTargetUser(actor, user))) {
    throw new Error('您沒有權限查看此人員');
  }
  const asset = await getActiveQrAssetForTarget(tenantId, QR_ASSET_TYPES.EMPLOYEE, user.id);
  const tenant = await getTenantById(tenantId);
  const sites = await getAuthorizedSites(user);
  return {
    user,
    asset,
    companyName: tenant?.officialName ?? null,
    authorizedSiteNames: sites.map((site) => site.name),
  };
}
