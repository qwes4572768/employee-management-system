import { listParcels } from '@/repositories/parcelRepository';
import { listVisitorPasses } from '@/repositories/visitorRepository';
import type { CommunityHomeCard } from '@/types';
import { toDateOnly } from '@/utils/datetime';

import { actorPermissionKeys } from './access';
import type { ActorContext } from './actor';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant } from './tenantGuard';

export async function getCommunityHomeCard(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<CommunityHomeCard> {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  if (!keys.includes('communityDashboard.view') && !keys.includes('visitor.view') && !keys.includes('parcel.view')) {
    throw new Error('沒有此操作權限');
  }
  await requireActorSiteAccess(actor, siteId);
  const today = toDateOnly(at);
  const now = at.getTime();
  const passes = await listVisitorPasses(tenantId, { siteId });
  const livePasses = passes.filter((item) => {
    if (item.status === 'registered' && item.expiresAt && new Date(item.expiresAt).getTime() < now) {
      return false;
    }
    return true;
  });
  const parcels = await listParcels(tenantId, { siteId });
  return {
    visitorsOnSite: livePasses.filter((item) => item.status === 'checked_in').length,
    visitorsToday: passes.filter((item) => item.createdAt.startsWith(today)).length,
    parcelsWaiting: parcels.filter((item) => item.status === 'registered' || item.status === 'notified').length,
    parcelsToday: parcels.filter((item) => item.registeredAt.startsWith(today)).length,
  };
}
