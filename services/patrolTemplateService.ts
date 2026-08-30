import {
  getPatrolTemplateById,
  insertPatrolTemplate,
  insertPatrolTemplatePoint,
  listPatrolTemplatePoints,
  listPatrolTemplates,
  updatePatrolTemplate,
} from '@/repositories/patrolTemplateRepository';
import { getPatrolPointById } from '@/repositories/patrolPointRepository';
import type { PatrolScheduleMode } from '@/constants/patrol';
import type { PatrolTemplate, PatrolTemplatePoint } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { parseHm } from '@/utils/scheduleTime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorSiteAccess, requireTenantRecord } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

async function requireTemplate(id: string, tenantId: string): Promise<PatrolTemplate> {
  return requireTenantRecord(
    await getPatrolTemplateById(id, tenantId),
    tenantId,
    () => getPatrolTemplateById(id),
    '找不到巡邏模板',
  );
}

export async function createPatrolTemplate(
  actor: ActorContext,
  input: {
    siteId: string;
    name: string;
    description?: string | null;
    shiftTemplateId?: string | null;
    scheduleMode?: PatrolScheduleMode;
    scheduleWeekdays?: number[] | null;
    customDates?: string[] | null;
    effectiveStartDate: string;
    effectiveEndDate?: string | null;
    allowLatePatrol?: boolean;
    enforceSequence?: boolean;
    liveCameraOnly?: boolean;
  },
): Promise<PatrolTemplate> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolTemplate.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const nameError = required(input.name, '模板名稱');
  const dateError = required(input.effectiveStartDate, '生效日');
  if (nameError || dateError) throw new Error(nameError ?? dateError ?? '模板資料不完整');
  const created = await insertPatrolTemplate({
    tenantId,
    siteId: site.id,
    name: input.name.trim(),
    description: input.description ?? null,
    shiftTemplateId: input.shiftTemplateId ?? null,
    scheduleMode: input.scheduleMode ?? 'daily',
    scheduleWeekdays: input.scheduleWeekdays ?? null,
    customDates: input.customDates ?? null,
    effectiveStartDate: input.effectiveStartDate,
    effectiveEndDate: input.effectiveEndDate ?? null,
    allowLatePatrol: input.allowLatePatrol,
    enforceSequence: input.enforceSequence,
    liveCameraOnly: input.liveCameraOnly,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'patrolTemplate',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」建立巡邏模板「${created.name}」。`,
    targetType: 'patrol_template',
    targetId: created.id,
    targetDisplayName: created.name,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function updatePatrolTemplateByActor(
  actor: ActorContext,
  id: string,
  patch: Parameters<typeof updatePatrolTemplate>[2],
): Promise<PatrolTemplate> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolTemplate.manage');
  const before = await requireTemplate(id, tenantId);
  await requireActorSiteAccess(actor, before.siteId);
  const after = await updatePatrolTemplate(id, tenantId, patch);
  const action = patch.status === 'inactive' ? '停用' : '修改';
  await writeAudit({
    actor,
    action: 'update',
    module: 'patrolTemplate',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${action}巡邏模板「${after.name}」。`,
    targetType: 'patrol_template',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function addPatrolTemplatePoint(
  actor: ActorContext,
  input: {
    templateId: string;
    patrolPointId: string;
    sequenceNo: number;
    windowStartTime: string;
    windowEndTime: string;
    requiredCount?: number;
    requireQrOverride?: boolean | null;
    requireGpsOverride?: boolean | null;
    requirePhotoOverride?: boolean | null;
    graceMinutes?: number;
    isRequired?: boolean;
    isCritical?: boolean;
  },
): Promise<PatrolTemplatePoint> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolTemplate.manage');
  const template = await requireTemplate(input.templateId, tenantId);
  await requireActorSiteAccess(actor, template.siteId);
  const point = await getPatrolPointById(input.patrolPointId, tenantId);
  if (!point) throw new Error('找不到巡邏點');
  if (point.siteId !== template.siteId) throw new Error('巡邏點與模板案場不符');
  parseHm(input.windowStartTime);
  parseHm(input.windowEndTime);
  const created = await insertPatrolTemplatePoint({
    tenantId,
    patrolTemplateId: template.id,
    patrolPointId: point.id,
    sequenceNo: input.sequenceNo,
    windowStartTime: input.windowStartTime,
    windowEndTime: input.windowEndTime,
    requiredCount: input.requiredCount,
    requireQrOverride: input.requireQrOverride,
    requireGpsOverride: input.requireGpsOverride,
    requirePhotoOverride: input.requirePhotoOverride,
    graceMinutes: input.graceMinutes,
    isRequired: input.isRequired,
    isCritical: input.isCritical,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'patrolTemplate',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 將「${point.name}」加入模板「${template.name}」。`,
    targetType: 'patrol_template',
    targetId: template.id,
    targetDisplayName: template.name,
    after: created,
    siteId: template.siteId,
  });
  return created;
}

export async function listPatrolTemplatesForActor(actor: ActorContext, siteId?: string | null) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolTemplate.view');
  const rows = await listPatrolTemplates(tenantId, { siteId: siteId ?? null });
  const visible: PatrolTemplate[] = [];
  for (const item of rows) {
    if (await requireActorSiteAccess(actor, item.siteId).then(() => true).catch(() => false)) {
      visible.push(item);
    }
  }
  return visible;
}

export async function getPatrolTemplateDetail(actor: ActorContext, id: string) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolTemplate.view');
  const template = await requireTemplate(id, tenantId);
  await requireActorSiteAccess(actor, template.siteId);
  const points = await listPatrolTemplatePoints(tenantId, template.id);
  return { template, points };
}
