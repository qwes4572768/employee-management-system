import { getTenantById, updateTenant } from '@/repositories/tenantRepository';
import type { Tenant } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorTenant, assertSameTenant } from './tenantGuard';

export async function editTenant(
  actor: ActorContext,
  tenantId: string,
  patch: Partial<{
    officialName: string;
    shortName: string;
    taxId: string | null;
    phone: string | null;
    address: string | null;
    logoUri: string | null;
    industryType: string | null;
  }>,
): Promise<Tenant> {
  const actorTenant = requireActorTenant(actor);
  assertSameTenant(actorTenant, tenantId);
  const before = await getTenantById(tenantId);
  if (!before) {
    throw new Error('找不到公司資料');
  }
  const after = await updateTenant(tenantId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'tenants',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 修改公司「${after.officialName}」資料`,
    targetType: 'tenant',
    targetId: after.id,
    targetDisplayName: after.officialName,
    before,
    after,
  });
  return after;
}

export { getTenantById };
