import { getParcelById } from '@/repositories/parcelRepository';
import { getResidentById, getResidentOccupancyById, hasCurrentOccupancy } from '@/repositories/residentRepository';
import { getSiteUnitById } from '@/repositories/unitRepository';
import { getVisitorPassById } from '@/repositories/visitorRepository';
import type { Parcel, Resident, ResidentOccupancy, SiteUnit, VisitorPass } from '@/types';

import type { ActorContext } from './actor';
import { requireActorSiteAccess, requireTenantRecord } from './patrolAccess';
import { requireActorTenant } from './tenantGuard';

export async function requireSiteUnitInTenant(id: string, tenantId: string): Promise<SiteUnit> {
  return requireTenantRecord(await getSiteUnitById(id, tenantId), tenantId, () => getSiteUnitById(id), '找不到戶別');
}

export async function requireResidentInTenant(id: string, tenantId: string): Promise<Resident> {
  return requireTenantRecord(await getResidentById(id, tenantId), tenantId, () => getResidentById(id), '找不到住戶');
}

export async function requireOccupancyInTenant(id: string, tenantId: string): Promise<ResidentOccupancy> {
  return requireTenantRecord(
    await getResidentOccupancyById(id, tenantId),
    tenantId,
    () => getResidentOccupancyById(id),
    '找不到住戶關係',
  );
}

export async function requireVisitorPassInTenant(id: string, tenantId: string): Promise<VisitorPass> {
  return requireTenantRecord(
    await getVisitorPassById(id, tenantId),
    tenantId,
    () => getVisitorPassById(id),
    '找不到訪客登記',
  );
}

export async function requireParcelInTenant(id: string, tenantId: string): Promise<Parcel> {
  return requireTenantRecord(await getParcelById(id, tenantId), tenantId, () => getParcelById(id), '找不到包裹');
}

export async function requireCommunitySiteRecord<T extends { siteId: string }>(
  actor: ActorContext,
  record: T,
): Promise<T> {
  requireActorTenant(actor);
  await requireActorSiteAccess(actor, record.siteId);
  return record;
}

export async function requireCurrentOccupancy(
  tenantId: string,
  residentId: string,
  unitId: string,
  missing: string,
): Promise<void> {
  const ok = await hasCurrentOccupancy(tenantId, residentId, unitId);
  if (!ok) throw new Error(missing);
}
