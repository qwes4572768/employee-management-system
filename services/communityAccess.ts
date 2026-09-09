import { getParcelById } from '@/repositories/parcelRepository';
import { getResidentById, getResidentOccupancyById, hasCurrentOccupancy } from '@/repositories/residentRepository';
import { getSiteUnitById } from '@/repositories/unitRepository';
import { getVisitorPassById } from '@/repositories/visitorRepository';
import { getParkingSpaceById, getParkingAssignmentById, getParkingOccupancyById, getParkingViolationById } from '@/repositories/parkingRepository';
import { getResidentVehicleById, getVehicleAccessPassById } from '@/repositories/vehicleRepository';
import { getManagedKeyById } from '@/repositories/keyRepository';
import { getLoanItemById } from '@/repositories/loanItemRepository';
import type {
  LoanItem,
  ManagedKey,
  Parcel,
  ParkingAssignment,
  ParkingOccupancy,
  ParkingSpace,
  ParkingViolation,
  Resident,
  ResidentOccupancy,
  ResidentVehicle,
  SiteUnit,
  VehicleAccessPass,
  VisitorPass,
} from '@/types';

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

export async function requireParkingSpaceInTenant(id: string, tenantId: string): Promise<ParkingSpace> {
  return requireTenantRecord(await getParkingSpaceById(id, tenantId), tenantId, () => getParkingSpaceById(id), '找不到車位');
}

export async function requireParkingAssignmentInTenant(id: string, tenantId: string): Promise<ParkingAssignment> {
  return requireTenantRecord(
    await getParkingAssignmentById(id, tenantId),
    tenantId,
    () => getParkingAssignmentById(id),
    '找不到車位指派',
  );
}

export async function requireResidentVehicleInTenant(id: string, tenantId: string): Promise<ResidentVehicle> {
  return requireTenantRecord(
    await getResidentVehicleById(id, tenantId),
    tenantId,
    () => getResidentVehicleById(id),
    '找不到車輛',
  );
}

export async function requireVehicleAccessPassInTenant(id: string, tenantId: string): Promise<VehicleAccessPass> {
  return requireTenantRecord(
    await getVehicleAccessPassById(id, tenantId),
    tenantId,
    () => getVehicleAccessPassById(id),
    '找不到車輛通行證',
  );
}

export async function requireParkingOccupancyInTenant(id: string, tenantId: string): Promise<ParkingOccupancy> {
  return requireTenantRecord(
    await getParkingOccupancyById(id, tenantId),
    tenantId,
    () => getParkingOccupancyById(id),
    '找不到占用紀錄',
  );
}

export async function requireParkingViolationInTenant(id: string, tenantId: string): Promise<ParkingViolation> {
  return requireTenantRecord(
    await getParkingViolationById(id, tenantId),
    tenantId,
    () => getParkingViolationById(id),
    '找不到違停紀錄',
  );
}

export async function requireManagedKeyInTenant(id: string, tenantId: string): Promise<ManagedKey> {
  return requireTenantRecord(await getManagedKeyById(id, tenantId), tenantId, () => getManagedKeyById(id), '找不到鑰匙');
}

export async function requireLoanItemInTenant(id: string, tenantId: string): Promise<LoanItem> {
  return requireTenantRecord(await getLoanItemById(id, tenantId), tenantId, () => getLoanItemById(id), '找不到物品');
}
