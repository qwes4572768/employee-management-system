import { listImprovementFollowups, insertImprovementFollowup, insertImprovementOrder, getImprovementOrderById, listImprovementOrders, updateImprovementOrderStatus } from '@/repositories/improvementRepository';
import { getInspectionEvaluationById } from '@/repositories/inspectionEvaluationRepository';
import type { ImprovementFollowup, ImprovementOrder } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireInspectionSession } from './inspectionService';
import { actorCanAccessSiteId } from './patrolAccess';
import { requireActorTenant, TenantAccessError } from './tenantGuard';

async function requireOrder(id: string, tenantId: string): Promise<ImprovementOrder> {
  const order = await getImprovementOrderById(id, tenantId);
  if (!order) {
    const other = await getImprovementOrderById(id);
    if (other) throw new TenantAccessError();
    throw new Error('找不到改善要求');
  }
  return order;
}

export async function createImprovementOrder(
  actor: ActorContext,
  input: {
    evaluationId: string;
    title: string;
    description: string;
    severity: ImprovementOrder['severity'];
    dueAt: string;
  },
): Promise<ImprovementOrder> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'improvement.create');
  if (!input.title.trim()) throw new Error('請填寫改善標題');
  const evaluation = await getInspectionEvaluationById(input.evaluationId, tenantId);
  if (!evaluation) throw new Error('找不到評核');
  if (evaluation.grade !== 'needs_improvement' && evaluation.grade !== 'serious_issue' && !evaluation.majorDeficiency) {
    throw new Error('僅待改善或重大缺失可建立改善要求');
  }
  const session = await requireInspectionSession(evaluation.inspectionSessionId, tenantId);
  if (!(await actorCanAccessSiteId(actor, session.siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
  const order = await insertImprovementOrder({
    tenantId,
    siteId: session.siteId,
    employeeUserId: evaluation.employeeUserId,
    inspectionEvaluationId: evaluation.id,
    title: input.title.trim(),
    description: input.description.trim(),
    severity: input.severity,
    dueAt: input.dueAt,
    assignedTo: evaluation.employeeUserId,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await insertImprovementFollowup({
    tenantId,
    improvementOrderId: order.id,
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    action: 'create',
    note: input.description.trim(),
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'improvement',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${session.siteNameSnapshot}」建立改善要求「${session.employeeNameSnapshot}」`,
    targetType: 'improvement_order',
    targetId: order.id,
    targetDisplayName: session.employeeNameSnapshot,
    siteId: session.siteId,
  });
  return order;
}

export async function submitImprovementReply(
  actor: ActorContext,
  input: { orderId: string; note: string; photoUri?: string | null },
): Promise<ImprovementOrder> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'improvement.view');
  if (!actor.userId) throw new Error('缺少操作者');
  const order = await requireOrder(input.orderId, tenantId);
  if (order.employeeUserId !== actor.userId) {
    throw new Error('只能回覆自己的改善事項');
  }
  if (!input.note.trim()) throw new Error('請填寫改善說明');
  await insertImprovementFollowup({
    tenantId,
    improvementOrderId: order.id,
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    action: 'submit',
    note: input.note.trim(),
    photoUri: input.photoUri ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const updated = await updateImprovementOrderStatus(order.id, tenantId, 'submitted');
  await writeAudit({
    actor,
    action: 'submit',
    module: 'improvement',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 提交改善回覆`,
    targetType: 'improvement_order',
    targetId: order.id,
    targetDisplayName: actor.fullName,
    siteId: order.siteId,
  });
  return updated;
}

export async function reviewImprovement(
  actor: ActorContext,
  input: { orderId: string; decision: 'reject' | 'verify' | 'close'; note?: string | null },
): Promise<ImprovementOrder> {
  const tenantId = requireActorTenant(actor);
  if (input.decision === 'close') {
    await requireActorPermission(actor, 'improvement.close');
  } else {
    await requireActorPermission(actor, 'improvement.review');
  }
  const order = await requireOrder(input.orderId, tenantId);
  if (!(await actorCanAccessSiteId(actor, order.siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
  const status = input.decision === 'reject' ? 'rejected' : input.decision === 'verify' ? 'verified' : 'closed';
  await insertImprovementFollowup({
    tenantId,
    improvementOrderId: order.id,
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    action: input.decision,
    note: input.note ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const updated = await updateImprovementOrderStatus(order.id, tenantId, status);
  const actionLabel = input.decision === 'reject' ? '退回' : input.decision === 'verify' ? '確認' : '結案';
  await writeAudit({
    actor,
    action: input.decision,
    module: 'improvement',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${actionLabel}改善要求`,
    targetType: 'improvement_order',
    targetId: order.id,
    siteId: order.siteId,
  });
  return updated;
}

export async function getImprovementDetail(actor: ActorContext, orderId: string): Promise<{
  order: ImprovementOrder;
  followups: ImprovementFollowup[];
}> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'improvement.view');
  const order = await requireOrder(orderId, tenantId);
  if (actor.userId !== order.employeeUserId && !(await actorCanAccessSiteId(actor, order.siteId))) {
    throw new Error('沒有此操作權限');
  }
  return { order, followups: await listImprovementFollowups(tenantId, order.id) };
}

export async function listImprovementsForActor(
  actor: ActorContext,
  input?: { employeeUserId?: string | null; siteId?: string | null; overdueOnly?: boolean },
): Promise<ImprovementOrder[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'improvement.view');
  if (input?.employeeUserId) {
    return listImprovementOrders(tenantId, input);
  }
  if (actor.userId && !(await requireActorPermission(actor, 'improvement.view').then(() => true))) {
    return listImprovementOrders(tenantId, { employeeUserId: actor.userId });
  }
  const keys = await requireActorPermission(actor, 'improvement.view');
  if (!keys.includes('improvement.review') && !keys.includes('improvement.close') && !keys.includes('inspection.view')) {
    return listImprovementOrders(tenantId, { employeeUserId: actor.userId });
  }
  const rows = await listImprovementOrders(tenantId, input);
  const visible: ImprovementOrder[] = [];
  for (const row of rows) {
    if (await actorCanAccessSiteId(actor, row.siteId)) visible.push(row);
  }
  return visible;
}
