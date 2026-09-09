import { listParkingOccupancies, listParkingSpaces, listParkingViolations } from '@/repositories/parkingRepository';
import { listManagedKeys, listKeyTransactions } from '@/repositories/keyRepository';
import { listItemLoanTransactions, listLoanItems } from '@/repositories/loanItemRepository';
import { listVehicleAccessPasses, listVehicleMovements } from '@/repositories/vehicleRepository';
import type { MobilityHomeCard } from '@/types';

import { actorPermissionKeys } from './access';
import type { ActorContext } from './actor';
import { lastEffectiveVehicleMovement, refreshParkingOverstaysForSite } from './vehicleService';
import { openKeyCheckout } from './keyService';
import { outstandingForBorrow } from './loanItemService';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant } from './tenantGuard';

export async function getMobilityHomeCard(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<MobilityHomeCard> {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  if (
    !keys.includes('mobilityDashboard.view') &&
    !keys.includes('vehicleAccess.view') &&
    !keys.includes('key.view') &&
    !keys.includes('loanItem.view') &&
    !keys.includes('parkingOccupancy.view')
  ) {
    throw new Error('沒有此操作權限');
  }
  await requireActorSiteAccess(actor, siteId);
  try {
    await refreshParkingOverstaysForSite(actor, siteId, at);
  } catch {
    // dashboard still shows current rows even if overstay refresh is denied
  }

  const movements = await listVehicleMovements(tenantId, { siteId });
  const byPlate = new Map<string, typeof movements>();
  for (const movement of movements) {
    const list = byPlate.get(movement.plateNoNormalized) ?? [];
    list.push(movement);
    byPlate.set(movement.plateNoNormalized, list);
  }
  const passes = await listVehicleAccessPasses(tenantId, { siteId });
  const passById = new Map(passes.map((item) => [item.id, item]));
  let vehiclesOnSite = 0;
  let visitorVehiclesOnSite = 0;
  for (const list of byPlate.values()) {
    const last = lastEffectiveVehicleMovement(list);
    if (last?.direction !== 'in') continue;
    vehiclesOnSite += 1;
    const pass = last.accessPassId ? passById.get(last.accessPassId) : null;
    if (
      pass &&
      (pass.accessType === 'visitor' ||
        pass.accessType === 'temporary' ||
        pass.accessType === 'delivery' ||
        pass.accessType === 'vendor' ||
        pass.accessType === 'moving' ||
        pass.accessType === 'construction')
    ) {
      visitorVehiclesOnSite += 1;
    }
  }

  const spaces = await listParkingSpaces(tenantId, { siteId, status: 'active' });
  const occupied = await listParkingOccupancies(tenantId, { siteId, openOnly: true });
  const violations = await listParkingViolations(tenantId, { siteId, status: 'open' });
  const overstayed = occupied.filter((item) => item.status === 'overstayed').length;

  const managedKeys = await listManagedKeys(tenantId, { siteId });
  let keysCheckedOut = 0;
  let keysOverdue = 0;
  for (const key of managedKeys.filter((item) => item.status === 'checked_out')) {
    keysCheckedOut += 1;
    const txs = await listKeyTransactions(tenantId, key.id);
    const open = openKeyCheckout(txs);
    if (open?.dueAt && new Date(open.dueAt).getTime() < at.getTime()) keysOverdue += 1;
  }

  const items = await listLoanItems(tenantId, { siteId });
  let itemsLoaned = 0;
  let itemsOverdue = 0;
  for (const item of items) {
    const txs = await listItemLoanTransactions(tenantId, item.id);
    for (const borrow of txs.filter((row) => row.transactionType === 'borrow')) {
      const outstanding = outstandingForBorrow(txs, borrow.id);
      if (outstanding <= 0) continue;
      itemsLoaned += outstanding;
      if (borrow.dueAt && new Date(borrow.dueAt).getTime() < at.getTime()) itemsOverdue += outstanding;
    }
  }

  return {
    vehiclesOnSite,
    visitorVehiclesOnSite,
    occupiedSpaces: occupied.length,
    totalActiveSpaces: spaces.length,
    occupancyRate: spaces.length === 0 ? 0 : Math.round((occupied.length / spaces.length) * 100),
    openViolations: violations.length,
    overstayedOccupancies: overstayed,
    keysCheckedOut,
    keysOverdue,
    itemsLoaned,
    itemsOverdue,
  };
}
