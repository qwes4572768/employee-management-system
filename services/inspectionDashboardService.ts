import { listDisciplinaryRecommendations } from '@/repositories/disciplineRepository';
import { listImprovementOrders } from '@/repositories/improvementRepository';
import { listInspectionEvaluations } from '@/repositories/inspectionEvaluationRepository';
import { listInspectionSessions } from '@/repositories/inspectionSessionRepository';
import { getSiteById } from '@/repositories/siteRepository';
import type { InspectionHomeCard, InspectionSiteDashboard } from '@/types';
import { nowIso, toDateOnly } from '@/utils/datetime';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { remindDueReinspections } from './inspectionService';
import { actorCanAccessSiteId } from './patrolAccess';
import { requireActorTenant } from './tenantGuard';

export async function getInspectionHomeCard(actor: ActorContext): Promise<InspectionHomeCard> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) {
    return { latest: null, latestScore: null, latestGrade: null, openImprovements: 0 };
  }
  await requireActorPermission(actor, 'inspection.viewOwn');
  const evaluations = (await listInspectionEvaluations(tenantId, { employeeUserId: actor.userId })).filter(
    (item) => item.status === 'completed',
  );
  const latest = evaluations[0] ?? null;
  const open = (await listImprovementOrders(tenantId, { employeeUserId: actor.userId })).filter(
    (item) => item.status !== 'verified' && item.status !== 'closed',
  );
  return {
    latest,
    latestScore: latest?.weightedScore ?? null,
    latestGrade: latest?.grade ?? null,
    openImprovements: open.length,
  };
}

export async function getInspectionSiteDashboard(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<InspectionSiteDashboard> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'inspectionDashboard.view');
  if (!(await actorCanAccessSiteId(actor, siteId))) {
    throw new Error('您沒有權限查看此案場');
  }
  await remindDueReinspections(tenantId, at);
  const site = await getSiteById(siteId, tenantId);
  const today = toDateOnly(at);
  const sessions = (await listInspectionSessions(tenantId, { siteId })).filter(
    (item) => item.startedAt.startsWith(today) && item.status !== 'cancelled' && item.status !== 'voided',
  );
  const evaluations = (await listInspectionEvaluations(tenantId, { siteId })).filter((item) => {
    if (item.status !== 'completed') return false;
    return item.createdAt.startsWith(today);
  });
  const scores = evaluations.map((item) => item.weightedScore);
  const averageScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const failCount = evaluations.filter((item) => item.grade === 'needs_improvement' || item.grade === 'serious_issue').length;
  const majorCount = evaluations.filter((item) => item.majorDeficiency).length;
  const openImprovements = (await listImprovementOrders(tenantId, { siteId })).filter(
    (item) => item.status !== 'verified' && item.status !== 'closed',
  ).length;
  const overdueImprovements = (await listImprovementOrders(tenantId, { siteId, overdueOnly: true })).length;
  const pendingDiscipline = (await listDisciplinaryRecommendations(tenantId, { siteId, status: 'pending_review' })).length;
  return {
    siteId,
    siteName: site?.name ?? '案場',
    todayCount: sessions.length,
    averageScore,
    failCount,
    majorCount,
    openImprovements,
    overdueImprovements,
    pendingDiscipline,
  };
}

export async function getManagerInspectionHomeStats(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<{
  todayCount: number;
  majorCount: number;
  pendingDiscipline: number;
  openImprovements: number;
}> {
  const dash = await getInspectionSiteDashboard(actor, siteId, at);
  return {
    todayCount: dash.todayCount,
    majorCount: dash.majorCount,
    pendingDiscipline: dash.pendingDiscipline,
    openImprovements: dash.openImprovements,
  };
}

export function inspectionHasPayrollDeduction(): boolean {
  return false;
}

export { nowIso };
