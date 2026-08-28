import { insertAuditLog, listAuditLogs } from '@/repositories/auditRepository';
import { jsonText } from '@/utils/data';

import type { ActorContext } from './actor';

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

export async function getAuditLogs(tenantId: string) {
  return listAuditLogs(tenantId);
}
