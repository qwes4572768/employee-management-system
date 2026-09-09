import { PATROL_EXCEPTION_SEVERITIES, type PatrolExceptionCategory, type PatrolExceptionSeverity, type PatrolExceptionStatus } from '@/constants/patrol';
import { insertNotification } from '@/repositories/notificationRepository';
import {
  getPatrolExceptionById,
  insertPatrolException,
  listPatrolExceptions,
  updatePatrolExceptionStatus,
} from '@/repositories/patrolExceptionRepository';
import { listUsersByTenant } from '@/repositories/userRepository';
import type { PatrolException } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getEffectivePermissionKeys } from './permissionService';
import { requireActorSiteAccess, requireTenantRecord } from './patrolAccess';
import { requirePatrolTask, requirePatrolTaskPoint } from './patrolTaskService';
import { getAuthorizedSites } from './siteService';
import { requireActorTenant } from './tenantGuard';

async function notifyManagers(tenantId: string, siteId: string, title: string, body: string, relatedId: string) {
  const users = await listUsersByTenant(tenantId);
  for (const user of users) {
    const keys = await getEffectivePermissionKeys(user);
    if (!keys.includes('patrolDashboard.view') && !keys.includes('patrolException.manage')) continue;
    const sites = await getAuthorizedSites(user);
    if (!sites.some((site) => site.id === siteId)) continue;
    await insertNotification({
      tenantId,
      userId: user.id,
      title,
      body,
      kind: 'patrol_exception',
      relatedId,
    });
  }
}

export async function createPatrolException(
  actor: ActorContext,
  input: {
    taskId: string;
    taskPointId?: string | null;
    category: PatrolExceptionCategory;
    severity?: PatrolExceptionSeverity;
    description: string;
    at?: Date;
  },
): Promise<PatrolException> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolException.create');
  if (!actor.userId) throw new Error('缺少操作者');
  const descError = required(input.description, '異常說明');
  if (descError) throw new Error(descError);
  const task = await requirePatrolTask(input.taskId, tenantId);
  await requireActorSiteAccess(actor, task.siteId);
  if (input.taskPointId) {
    const point = await requirePatrolTaskPoint(input.taskPointId, tenantId);
    if (point.patrolTaskId !== task.id) throw new Error('異常巡邏點與任務不符');
  }
  const severity = input.severity ?? PATROL_EXCEPTION_SEVERITIES.GENERAL;
  const created = await insertPatrolException({
    tenantId,
    siteId: task.siteId,
    patrolTaskId: task.id,
    patrolTaskPointId: input.taskPointId ?? null,
    reportedBy: actor.userId,
    category: input.category,
    severity,
    description: input.description.trim(),
    reportedAt: (input.at ?? new Date()).toISOString(),
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  if (severity === PATROL_EXCEPTION_SEVERITIES.URGENT || severity === PATROL_EXCEPTION_SEVERITIES.MAJOR) {
    await notifyManagers(
      tenantId,
      task.siteId,
      '巡邏重大異常',
      `${actor.fullName} 在「${task.siteNameSnapshot}」回報${severity === 'major' ? '重大' : '緊急'}異常：${created.description}`,
      created.id,
    );
  }
  await writeAudit({
    actor,
    action: 'create',
    module: 'patrolException',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${task.siteNameSnapshot}」回報巡邏異常。`,
    targetType: 'patrol_exception',
    targetId: created.id,
    after: created,
    siteId: task.siteId,
  });
  return created;
}

export async function updatePatrolExceptionByActor(
  actor: ActorContext,
  id: string,
  status: PatrolExceptionStatus,
): Promise<PatrolException> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolException.manage');
  const before = await requireTenantRecord(
    await getPatrolExceptionById(id, tenantId),
    tenantId,
    () => getPatrolExceptionById(id),
    '找不到巡邏異常',
  );
  await requireActorSiteAccess(actor, before.siteId);
  const after = await updatePatrolExceptionStatus(id, tenantId, status);
  await writeAudit({
    actor,
    action: 'update',
    module: 'patrolException',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 將巡邏異常改為「${status}」。`,
    targetType: 'patrol_exception',
    targetId: after.id,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function listPatrolExceptionsForActor(
  actor: ActorContext,
  input?: { siteId?: string | null; taskId?: string | null },
) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolException.view');
  const rows = await listPatrolExceptions(tenantId, input);
  const visible: PatrolException[] = [];
  for (const item of rows) {
    if (await requireActorSiteAccess(actor, item.siteId).then(() => true).catch(() => false)) {
      visible.push(item);
    }
  }
  return visible;
}
