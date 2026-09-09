import { toDateOnly } from '@/utils/datetime';
import { listPatrolExceptions } from '@/repositories/patrolExceptionRepository';
import { listPatrolTemplates } from '@/repositories/patrolTemplateRepository';
import { getUserById } from '@/repositories/userRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { listPatrolTasks } from '@/repositories/patrolTaskRepository';
import { listPatrolChecksForTask } from '@/repositories/patrolCheckRepository';
import type { PatrolSiteDashboard, PatrolTask } from '@/types';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { requireActorSiteAccess } from './patrolAccess';
import { computeTaskStats, getPatrolTaskDetail, refreshPatrolTask } from './patrolTaskService';
import { requireActorTenant } from './tenantGuard';

export async function getPatrolSiteDashboard(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<PatrolSiteDashboard> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolDashboard.view');
  await requireActorSiteAccess(actor, siteId);
  const site = await getSiteById(siteId, tenantId);
  if (!site) throw new Error('找不到案場');
  const taskDate = toDateOnly(at);
  const tasks = await listPatrolTasks(tenantId, { siteId, taskDate });
  let onTime = 0;
  let late = 0;
  let missed = 0;
  let exceptions = 0;
  let totalPoints = 0;
  let criticalMissed = 0;
  let activeCount = 0;
  let completedCount = 0;
  let partialCount = 0;
  let missedTaskCount = 0;
  for (const task of tasks) {
    const refreshed = await refreshPatrolTask(tenantId, task.id, at);
    const checks = await listPatrolChecksForTask(tenantId, task.id);
    const ex = await listPatrolExceptions(tenantId, { taskId: task.id });
    const templates = await listPatrolTemplates(tenantId, { siteId });
    const template = templates.find((item) => item.id === task.patrolTemplateId);
    const stats = computeTaskStats(refreshed.points, checks, ex.length, at, template?.allowLatePatrol ?? false);
    onTime += stats.onTime;
    late += stats.late;
    missed += stats.missed;
    exceptions += stats.exceptions;
    totalPoints += stats.totalRequired;
    criticalMissed += stats.criticalMissed;
    if (refreshed.task.status === 'active' || refreshed.task.status === 'pending') activeCount += 1;
    if (refreshed.task.status === 'completed') completedCount += 1;
    if (refreshed.task.status === 'partial') partialCount += 1;
    if (refreshed.task.status === 'missed') missedTaskCount += 1;
  }
  const completedPoints = onTime + late;
  return {
    siteId: site.id,
    siteName: site.name,
    taskCount: tasks.length,
    activeCount,
    completedCount,
    partialCount,
    missedTaskCount,
    totalPoints,
    onTime,
    late,
    missed,
    exceptions,
    completionRate: totalPoints === 0 ? 0 : Math.round((completedPoints / totalPoints) * 1000) / 10,
    criticalMissed,
    criticalWarning: criticalMissed > 0 ? `重點巡邏點漏巡 ${criticalMissed} 處` : null,
  };
}

export async function listPatrolDashboardTasks(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<Array<{ task: PatrolTask; userName: string; stats: Awaited<ReturnType<typeof getPatrolTaskDetail>>['stats'] }>> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrolDashboard.view');
  await requireActorSiteAccess(actor, siteId);
  const tasks = await listPatrolTasks(tenantId, { siteId, taskDate: toDateOnly(at) });
  const rows = [];
  for (const task of tasks) {
    const detail = await getPatrolTaskDetail(actor, task.id, at);
    const user = await getUserById(task.userId, tenantId);
    rows.push({ task: detail.task, userName: user?.fullName ?? '—', stats: detail.stats });
  }
  return rows;
}

export async function getManagerPatrolHomeStats(
  actor: ActorContext,
  siteId: string | null,
  at: Date = new Date(),
): Promise<PatrolSiteDashboard | null> {
  if (!siteId) return null;
  return getPatrolSiteDashboard(actor, siteId, at);
}
