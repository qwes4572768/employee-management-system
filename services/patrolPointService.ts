import { getPatrolPointById, insertPatrolPoint, listPatrolPoints, updatePatrolPoint } from '@/repositories/patrolPointRepository';
import type { PatrolPoint } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorSiteAccess, requireTenantRecord } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

async function requirePoint(id: string, tenantId: string): Promise<PatrolPoint> {
  return requireTenantRecord(
    await getPatrolPointById(id, tenantId),
    tenantId,
    () => getPatrolPointById(id),
    '找不到巡邏點',
  );
}

export async function createPatrolPoint(
  actor: ActorContext,
  input: {
    siteId: string;
    name: string;
    code: string;
    description?: string | null;
    locationNote?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    gpsRadiusMeters?: number | null;
    requireQr?: boolean;
    requireGps?: boolean;
    requirePhoto?: boolean;
    sortOrder?: number;
  },
): Promise<PatrolPoint> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolPoint.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const nameError = required(input.name, '巡邏點名稱');
  const codeError = required(input.code, '巡邏點代碼');
  if (nameError || codeError) throw new Error(nameError ?? codeError ?? '巡邏點資料不完整');
  let created: PatrolPoint;
  try {
    created = await insertPatrolPoint({
      tenantId,
      siteId: site.id,
      name: input.name.trim(),
      code: input.code.trim(),
      description: input.description ?? null,
      locationNote: input.locationNote ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      gpsRadiusMeters: input.gpsRadiusMeters ?? null,
      requireQr: input.requireQr,
      requireGps: input.requireGps,
      requirePhoto: input.requirePhoto,
      sortOrder: input.sortOrder,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) throw new Error('巡邏點代碼已存在');
    throw error;
  }
  await writeAudit({
    actor,
    action: 'create',
    module: 'patrolPoint',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」建立巡邏點「${created.name}」。`,
    targetType: 'patrol_point',
    targetId: created.id,
    targetDisplayName: created.name,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function updatePatrolPointByActor(
  actor: ActorContext,
  id: string,
  patch: Parameters<typeof updatePatrolPoint>[2],
): Promise<PatrolPoint> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolPoint.manage');
  const before = await requirePoint(id, tenantId);
  await requireActorSiteAccess(actor, before.siteId);
  const after = await updatePatrolPoint(id, tenantId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'patrolPoint',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 修改巡邏點「${after.name}」。`,
    targetType: 'patrol_point',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function deactivatePatrolPointByActor(actor: ActorContext, id: string): Promise<PatrolPoint> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolPoint.manage');
  const before = await requirePoint(id, tenantId);
  await requireActorSiteAccess(actor, before.siteId);
  const after = await updatePatrolPoint(id, tenantId, { status: 'inactive' });
  await writeAudit({
    actor,
    action: 'update',
    module: 'patrolPoint',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 停用巡邏點「${after.name}」。`,
    targetType: 'patrol_point',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function listPatrolPointsForActor(
  actor: ActorContext,
  siteId?: string | null,
): Promise<PatrolPoint[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolPoint.view');
  const rows = await listPatrolPoints(tenantId, { siteId: siteId ?? null });
  const visible: PatrolPoint[] = [];
  for (const item of rows) {
    if (await requireActorSiteAccess(actor, item.siteId).then(() => true).catch(() => false)) {
      visible.push(item);
    }
  }
  return visible;
}

export async function getPatrolPointForActor(actor: ActorContext, id: string): Promise<PatrolPoint> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolPoint.view');
  const point = await requirePoint(id, tenantId);
  await requireActorSiteAccess(actor, point.siteId);
  return point;
}
