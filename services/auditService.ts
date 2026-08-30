import { insertAuditLog, listAuditLogs } from '@/repositories/auditRepository';
import { jsonText } from '@/utils/data';

import type { ActorContext } from './actor';
import { requireActorTenant } from './tenantGuard';

export async function writeAudit(input: {
  actor: ActorContext;
  action: string;
  module: string;
  description: string;
  targetType?: string | null;
  targetId?: string | null;
  targetDisplayName?: string | null;
  before?: unknown;
  after?: unknown;
  result?: 'success' | 'failure';
  siteId?: string | null;
}): Promise<void> {
  await insertAuditLog({
    tenantId: input.actor.tenantId,
    siteId: input.siteId ?? input.actor.siteId,
    actorUserId: input.actor.userId,
    actorNameSnapshot: input.actor.fullName,
    actorAccountSnapshot: input.actor.account,
    actorRoleSnapshot: input.actor.roleSnapshot,
    action: input.action,
    module: input.module,
    targetType: input.targetType,
    targetId: input.targetId,
    targetDisplayName: input.targetDisplayName,
    description: input.description,
    beforeData: jsonText(input.before),
    afterData: jsonText(input.after),
    result: input.result ?? 'success',
    deviceId: input.actor.deviceId,
    appVersion: input.actor.appVersion,
  });
}

export async function getAuditLogs(tenantId: string, actor?: ActorContext) {
  if (actor) {
    const actorTenant = requireActorTenant(actor);
    if (actorTenant !== tenantId) {
      throw new Error('無權存取其他公司的資料');
    }
  }
  return listAuditLogs(tenantId);
}
