import { getTenantById, updateTenant } from '@/repositories/tenantRepository';
import type { Tenant } from '@/types';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';

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
  const before = await getTenantById(tenantId);
  if (!before) {
    throw new Error('找不到公司資料');
  }
  const after = await updateTenant(tenantId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'tenants',
    description: `${actor.fullName} 修改公司「${after.officialName}」資料`,
    targetType: 'tenant',
    targetId: after.id,
    targetDisplayName: after.officialName,
    before,
    after,
  });
  return after;
}

export { getTenantById };
