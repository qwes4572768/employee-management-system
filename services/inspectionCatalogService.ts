import {
  ensureInspectionCatalog,
  getInspectionPolicy,
  listInspectionCriteria,
  updateInspectionCriteria,
  upsertInspectionPolicy,
} from '@/repositories/inspectionCatalogRepository';
import type { InspectionCriteria, InspectionPolicy } from '@/types';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorTenant } from './tenantGuard';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';

export async function requireInspectionPolicy(tenantId: string): Promise<InspectionPolicy> {
  await ensureInspectionCatalog(tenantId);
  const policy = await getInspectionPolicy(tenantId);
  if (!policy) throw new Error('找不到評核政策');
  return policy;
}

export async function getInspectionPolicyForActor(actor: ActorContext): Promise<InspectionPolicy> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspectionCriteria.view');
  return requireInspectionPolicy(tenantId);
}

export async function updateInspectionPolicyForActor(
  actor: ActorContext,
  patch: Partial<Pick<InspectionPolicy, 'excellentMinScore' | 'goodMinScore' | 'passMinScore'>>,
): Promise<InspectionPolicy> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspectionCriteria.manage');
  const updated = await upsertInspectionPolicy(tenantId, patch, {
    userId: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'inspectionCriteria',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 更新督勤評分門檻`,
    targetType: 'inspection_policy',
    targetId: updated.id,
    after: updated,
  });
  return updated;
}

export async function listInspectionCriteriaForActor(
  actor: ActorContext,
  input?: { status?: 'active' | 'inactive' | null },
): Promise<InspectionCriteria[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspectionCriteria.view');
  await ensureInspectionCatalog(tenantId);
  return listInspectionCriteria(tenantId, input);
}

export async function updateInspectionCriteriaForActor(
  actor: ActorContext,
  id: string,
  patch: Partial<Pick<InspectionCriteria, 'displayName' | 'maxScore' | 'weight' | 'required' | 'majorEligible' | 'status' | 'sortOrder'>>,
): Promise<InspectionCriteria> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspectionCriteria.manage');
  const updated = await updateInspectionCriteria(id, tenantId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'inspectionCriteria',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 調整評核項目「${updated.displayName}」`,
    targetType: 'inspection_criteria',
    targetId: updated.id,
    targetDisplayName: updated.displayName,
    after: updated,
  });
  return updated;
}
