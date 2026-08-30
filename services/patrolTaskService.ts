import { PATROL_POINT_LIVE_STATUSES, PATROL_TASK_STATUSES, type PatrolPointLiveStatus, type PatrolTaskStatus } from '@/constants/patrol';
import { getEffectivePatrolCheck, listPatrolChecksForTask } from '@/repositories/patrolCheckRepository';
import { listPatrolExceptions } from '@/repositories/patrolExceptionRepository';
import { getPatrolPointById } from '@/repositories/patrolPointRepository';
import {
  findPatrolTask,
  getPatrolTaskById,
  getPatrolTaskPointById,
  insertPatrolTask,
  insertPatrolTaskPoint,
  listPatrolTaskPoints,
  listPatrolTasks,
  updatePatrolTaskCounters,
  updatePatrolTaskPointState,
} from '@/repositories/patrolTaskRepository';
import { listPatrolTemplatePoints, listPatrolTemplates } from '@/repositories/patrolTemplateRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getWorkScheduleById } from '@/repositories/workforceRepository';
import { getActiveWorkSession } from '@/repositories/workSessionRepository';
import type { PatrolHomeCard, PatrolPointView, PatrolTask, PatrolTaskPoint, PatrolTaskStats, WorkSession } from '@/types';
import { formatDateTimeZh, nowIso, parseDateOnly, toDateOnly } from '@/utils/datetime';
import { formatWindowLabel, graceDeadline, minutesUntil, resolvePatrolWindow } from '@/utils/patrolWindow';

import { actorPermissionKeys, requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorSiteAccess, requireTenantRecord } from './patrolAccess';
import { requireActorTenant } from './tenantGuard';

export function resolveRequirementFlag(override: boolean | null, fallback: boolean): boolean {
  return override == null ? fallback : override;
}

function weekdayOf(dateOnly: string): number {
  const date = parseDateOnly(dateOnly);
  if (!date) throw new Error('勤務日期不正確');
  return date.getDay();
}

function templateApplies(template: {
  status: string;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  shiftTemplateId: string | null;
  scheduleMode: string;
  scheduleWeekdays: number[] | null;
  customDates: string[] | null;
}, taskDate: string, shiftTemplateId: string | null): boolean {
  if (template.status !== 'active') return false;
  if (template.effectiveStartDate > taskDate) return false;
  if (template.effectiveEndDate && template.effectiveEndDate < taskDate) return false;
  if (template.shiftTemplateId && template.shiftTemplateId !== shiftTemplateId) return false;
  if (template.scheduleMode === 'weekday') {
    const days = template.scheduleWeekdays ?? [1, 2, 3, 4, 5];
    return days.includes(weekdayOf(taskDate));
  }
  if (template.scheduleMode === 'custom') {
    return (template.customDates ?? []).includes(taskDate);
  }
  return true;
}

export function liveStatusForPoint(
  point: PatrolTaskPoint,
  now: Date,
  allowLate: boolean,
  hasOpenException: boolean,
): PatrolPointLiveStatus {
  if (point.completedAt) {
    return PATROL_POINT_LIVE_STATUSES.COMPLETED;
  }
  if (hasOpenException) {
    return PATROL_POINT_LIVE_STATUSES.EXCEPTION;
  }
  const start = new Date(point.windowStartAt);
  const end = new Date(point.windowEndAt);
  const graceEnd = graceDeadline(end, point.graceMinutes);
  if (now.getTime() < start.getTime()) return PATROL_POINT_LIVE_STATUSES.UPCOMING;
  if (now.getTime() <= end.getTime()) return PATROL_POINT_LIVE_STATUSES.AVAILABLE;
  if (now.getTime() <= graceEnd.getTime()) return PATROL_POINT_LIVE_STATUSES.LATE;
  if (allowLate) return PATROL_POINT_LIVE_STATUSES.LATE;
  return PATROL_POINT_LIVE_STATUSES.MISSED;
}

export function computeTaskStats(
  points: PatrolTaskPoint[],
  checks: Array<{ patrolTaskPointId: string; result: string }>,
  exceptionsCount: number,
  now: Date,
  allowLate: boolean,
): PatrolTaskStats {
  const required = points.filter((item) => item.isRequired);
  let onTime = 0;
  let late = 0;
  let missed = 0;
  let criticalMissed = 0;
  for (const point of required) {
    const check = checks.find((item) => item.patrolTaskPointId === point.id);
    if (check?.result === 'success') {
      onTime += 1;
      continue;
    }
    if (check?.result === 'late_success' || check?.result === 'manual_override') {
      late += 1;
      continue;
    }
    const live = liveStatusForPoint(point, now, allowLate, false);
    if (live === PATROL_POINT_LIVE_STATUSES.MISSED || point.missedAt) {
      missed += 1;
      if (point.isCritical) criticalMissed += 1;
    }
  }
  const completed = onTime + late;
  const totalRequired = required.length;
  return {
    totalRequired,
    completed,
    onTime,
    late,
    missed,
    exceptions: exceptionsCount,
    completionRate: totalRequired === 0 ? 0 : Math.round((completed / totalRequired) * 1000) / 10,
    criticalMissed,
  };
}

function taskStatusFromStats(stats: PatrolTaskStats, current: PatrolTaskStatus): PatrolTaskStatus {
  if (current === PATROL_TASK_STATUSES.CANCELLED) return current;
  if (stats.totalRequired === 0) return PATROL_TASK_STATUSES.ACTIVE;
  if (stats.completed === stats.totalRequired) return PATROL_TASK_STATUSES.COMPLETED;
  if (stats.missed === stats.totalRequired && stats.completed === 0) return PATROL_TASK_STATUSES.MISSED;
  if (stats.missed > 0 && stats.completed > 0) return PATROL_TASK_STATUSES.PARTIAL;
  if (stats.missed > 0 && stats.completed === 0) return PATROL_TASK_STATUSES.MISSED;
  return PATROL_TASK_STATUSES.ACTIVE;
}

export async function requirePatrolTask(id: string, tenantId: string): Promise<PatrolTask> {
  return requireTenantRecord(await getPatrolTaskById(id, tenantId), tenantId, () => getPatrolTaskById(id), '找不到巡邏任務');
}

export async function requirePatrolTaskPoint(id: string, tenantId: string): Promise<PatrolTaskPoint> {
  return requireTenantRecord(
    await getPatrolTaskPointById(id, tenantId),
    tenantId,
    () => getPatrolTaskPointById(id),
    '找不到巡邏任務點',
  );
}

export async function refreshPatrolTask(tenantId: string, taskId: string, at: Date = new Date()): Promise<{
  task: PatrolTask;
  points: PatrolTaskPoint[];
  stats: PatrolTaskStats;
}> {
  const task = await requirePatrolTask(taskId, tenantId);
  const templates = await listPatrolTemplates(tenantId, { siteId: task.siteId });
  const template = templates.find((item) => item.id === task.patrolTemplateId);
  const allowLate = template?.allowLatePatrol ?? false;
  const points = await listPatrolTaskPoints(tenantId, task.id);
  const checks = await listPatrolChecksForTask(tenantId, task.id);
  const exceptions = await listPatrolExceptions(tenantId, { taskId: task.id });
  for (const point of points) {
    if (point.completedAt) continue;
    const end = new Date(point.windowEndAt);
    const graceEnd = graceDeadline(end, point.graceMinutes);
    if (at.getTime() > graceEnd.getTime() && !point.missedAt) {
      await updatePatrolTaskPointState(point.id, tenantId, {
        status: PATROL_POINT_LIVE_STATUSES.MISSED,
        missedAt: at.toISOString(),
      });
    } else if (!point.completedAt) {
      const live = liveStatusForPoint(point, at, allowLate, false);
      if (live !== point.status && live !== PATROL_POINT_LIVE_STATUSES.COMPLETED) {
        await updatePatrolTaskPointState(point.id, tenantId, { status: live });
      }
    }
  }
  const refreshed = await listPatrolTaskPoints(tenantId, task.id);
  const stats = computeTaskStats(refreshed, checks, exceptions.length, at, allowLate);
  const updated = await updatePatrolTaskCounters(task.id, tenantId, {
    status: taskStatusFromStats(stats, task.status),
    totalPoints: stats.totalRequired,
    completedPoints: stats.completed,
    missedPoints: stats.missed,
    completionRate: stats.completionRate,
  });
  return { task: updated, points: refreshed, stats };
}

export async function generatePatrolTasksForSession(
  actor: ActorContext,
  session: WorkSession,
  at: Date = new Date(),
): Promise<PatrolTask[]> {
  const tenantId = requireActorTenant(actor);
  const schedule = session.scheduleId ? await getWorkScheduleById(session.scheduleId, tenantId) : null;
  const site = await getSiteById(session.siteId, tenantId);
  if (!site) throw new Error('找不到案場');
  const taskDate = schedule?.workDate ?? toDateOnly(new Date(session.startedAt));
  const shiftStart = schedule ? new Date(schedule.scheduledStartAt) : new Date(session.startedAt);
  const shiftEnd = schedule
    ? new Date(schedule.scheduledEndAt)
    : new Date(shiftStart.getTime() + 12 * 60 * 60 * 1000);
  const templates = (await listPatrolTemplates(tenantId, { siteId: site.id, status: 'active' })).filter((item) =>
    templateApplies(item, taskDate, schedule?.shiftTemplateId ?? null),
  );
  const created: PatrolTask[] = [];
  for (const template of templates) {
    const existing = await findPatrolTask({
      tenantId,
      userId: session.userId,
      patrolTemplateId: template.id,
      scheduleId: schedule?.id ?? null,
      workSessionId: schedule ? null : session.id,
    });
    if (existing) {
      if (existing.workSessionId !== session.id) {
        await updatePatrolTaskCounters(existing.id, tenantId, {
          status: existing.status,
          totalPoints: existing.totalPoints,
          completedPoints: existing.completedPoints,
          missedPoints: existing.missedPoints,
          completionRate: existing.completionRate,
          workSessionId: session.id,
        });
      }
      continue;
    }
    const templatePoints = await listPatrolTemplatePoints(tenantId, template.id);
    if (templatePoints.length === 0) continue;
    let task: PatrolTask;
    try {
      task = await insertPatrolTask({
        tenantId,
        siteId: site.id,
        userId: session.userId,
        scheduleId: schedule?.id ?? null,
        workSessionId: session.id,
        patrolTemplateId: template.id,
        taskDate,
        scheduledStartAt: shiftStart.toISOString(),
        scheduledEndAt: shiftEnd.toISOString(),
        status: 'active',
        totalPoints: templatePoints.filter((item) => item.isRequired).length,
        templateNameSnapshot: template.name,
        siteNameSnapshot: site.name,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/UNIQUE/i.test(text)) continue;
      throw error;
    }
    for (const item of templatePoints) {
      const point = await getPatrolPointById(item.patrolPointId, tenantId);
      if (!point) continue;
      const window = resolvePatrolWindow({
        shiftStart,
        shiftEnd,
        windowStartTime: item.windowStartTime,
        windowEndTime: item.windowEndTime,
      });
      await insertPatrolTaskPoint({
        tenantId,
        siteId: site.id,
        patrolTaskId: task.id,
        patrolPointId: point.id,
        pointNameSnapshot: point.name,
        pointCodeSnapshot: point.code,
        sequenceNo: item.sequenceNo,
        windowStartAt: window.start.toISOString(),
        windowEndAt: window.end.toISOString(),
        requireQr: resolveRequirementFlag(item.requireQrOverride, point.requireQr),
        requireGps: resolveRequirementFlag(item.requireGpsOverride, point.requireGps),
        requirePhoto: resolveRequirementFlag(item.requirePhotoOverride, point.requirePhoto),
        gpsRadiusMetersSnapshot: point.gpsRadiusMeters,
        latitudeSnapshot: point.latitude,
        longitudeSnapshot: point.longitude,
        graceMinutes: item.graceMinutes,
        isRequired: item.isRequired,
        isCritical: item.isCritical,
        status: liveStatusForPoint(
          {
            id: '',
            tenantId,
            siteId: site.id,
            patrolTaskId: task.id,
            patrolPointId: point.id,
            pointNameSnapshot: point.name,
            pointCodeSnapshot: point.code,
            sequenceNo: item.sequenceNo,
            windowStartAt: window.start.toISOString(),
            windowEndAt: window.end.toISOString(),
            requireQr: true,
            requireGps: false,
            requirePhoto: false,
            gpsRadiusMetersSnapshot: null,
            latitudeSnapshot: null,
            longitudeSnapshot: null,
            graceMinutes: item.graceMinutes,
            isRequired: item.isRequired,
            isCritical: item.isCritical,
            status: 'upcoming',
            completedAt: null,
            missedAt: null,
            createdBy: actor.userId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            deletedAt: null,
            version: 1,
            syncStatus: 'local',
            deviceId: actor.deviceId,
          },
          at,
          template.allowLatePatrol,
          false,
        ),
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      });
    }
    await writeAudit({
      actor,
      action: 'create',
      module: 'patrol',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」生成巡邏任務「${template.name}」。`,
      targetType: 'patrol_task',
      targetId: task.id,
      targetDisplayName: template.name,
      after: task,
      siteId: site.id,
    });
    created.push((await refreshPatrolTask(tenantId, task.id, at)).task);
  }
  return created;
}

export async function getOwnActivePatrolCard(actor: ActorContext, at: Date = new Date()): Promise<PatrolHomeCard> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrol.viewOwn');
  if (!actor.userId) throw new Error('缺少操作者');
  const session = await getActiveWorkSession(tenantId, actor.userId);
  const tasks = await listPatrolTasks(tenantId, { userId: actor.userId });
  const current =
    tasks.find((item) => session && item.workSessionId === session.id) ??
    tasks.find((item) => item.status === 'active' || item.status === 'pending') ??
    tasks[0] ??
    null;
  if (!current) {
    return {
      task: null,
      stats: { totalRequired: 0, completed: 0, onTime: 0, late: 0, missed: 0, exceptions: 0, completionRate: 0, criticalMissed: 0 },
      nextPoint: null,
      minutesUntilNext: null,
      criticalWarning: null,
    };
  }
  const { task, points, stats } = await refreshPatrolTask(tenantId, current.id, at);
  const exceptions = await listPatrolExceptions(tenantId, { taskId: task.id });
  const views = points.map((point) => toPointView(point, at, false, exceptions.some((item) => item.patrolTaskPointId === point.id && item.status !== 'resolved')));
  const next =
    views.find((item) => item.liveStatus === 'available' || item.liveStatus === 'late') ??
    views.find((item) => item.liveStatus === 'upcoming') ??
    null;
  return {
    task,
    stats,
    nextPoint: next,
    minutesUntilNext: next && next.liveStatus === 'upcoming' ? Math.max(0, minutesUntil(at, next.windowStartAt)) : null,
    criticalWarning:
      stats.criticalMissed > 0 ? `重點巡邏點漏巡 ${stats.criticalMissed} 處，請立即處理` : null,
  };
}

export function toPointView(
  point: PatrolTaskPoint,
  now: Date,
  allowLate: boolean,
  hasOpenException: boolean,
): PatrolPointView {
  const liveStatus = liveStatusForPoint(point, now, allowLate, hasOpenException);
  return {
    ...point,
    liveStatus,
    windowLabel: formatWindowLabel(point.windowStartAt, point.windowEndAt),
    completedAtLabel: point.completedAt ? formatDateTimeZh(point.completedAt) : null,
  };
}

export async function getPatrolTaskDetail(actor: ActorContext, taskId: string, at: Date = new Date()) {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  const { task, points, stats } = await refreshPatrolTask(tenantId, taskId, at);
  if (task.userId === actor.userId) {
    await requireActorPermission(actor, 'patrol.viewOwn');
  } else if (!keys.includes('patrol.view') && !keys.includes('patrolDashboard.view')) {
    throw new Error('沒有此操作權限');
  }
  if (task.userId !== actor.userId) {
    await requireActorSiteAccess(actor, task.siteId);
  }
  const templates = await listPatrolTemplates(tenantId, { siteId: task.siteId });
  const template = templates.find((item) => item.id === task.patrolTemplateId);
  const exceptions = await listPatrolExceptions(tenantId, { taskId: task.id });
  const views = points.map((point) =>
    toPointView(
      point,
      at,
      template?.allowLatePatrol ?? false,
      exceptions.some((item) => item.patrolTaskPointId === point.id && item.status !== 'resolved'),
    ),
  );
  return { task, points: views, stats, template, exceptions };
}

export async function listOwnPatrolTasks(actor: ActorContext) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'patrol.viewOwn');
  if (!actor.userId) throw new Error('缺少操作者');
  return listPatrolTasks(tenantId, { userId: actor.userId });
}

export async function assertCanExecutePoint(
  actor: ActorContext,
  point: PatrolTaskPoint,
  task: PatrolTask,
  at: Date,
  options?: { manualOverride?: boolean },
): Promise<{ allowLate: boolean; live: PatrolPointLiveStatus }> {
  const tenantId = requireActorTenant(actor);
  if (!options?.manualOverride) {
    await requireActorPermission(actor, 'patrol.execute');
    if (task.userId !== actor.userId) throw new Error('只能執行自己的巡邏任務');
    const session = actor.userId ? await getActiveWorkSession(tenantId, actor.userId) : null;
    if (!session || session.id !== task.workSessionId) {
      throw new Error('請先開始勤務後再執行巡邏');
    }
  }
  await requireActorSiteAccess(actor, task.siteId);
  const existing = await getEffectivePatrolCheck(tenantId, point.id);
  if (existing) {
    throw new Error(`此巡邏點已於 ${formatDateTimeZh(existing.checkedAt).slice(-5)} 完成`);
  }
  const templates = await listPatrolTemplates(tenantId, { siteId: task.siteId });
  const template = templates.find((item) => item.id === task.patrolTemplateId);
  const allowLate = template?.allowLatePatrol ?? false;
  const live = liveStatusForPoint(point, at, allowLate, false);
  if (live === PATROL_POINT_LIVE_STATUSES.UPCOMING && !options?.manualOverride) {
    throw new Error('此巡邏點尚未開放');
  }
  if (live === PATROL_POINT_LIVE_STATUSES.MISSED && !allowLate && !options?.manualOverride) {
    throw new Error('此巡邏點已漏巡，且未開放補巡');
  }
  if (template?.enforceSequence && !options?.manualOverride) {
    const siblings = await listPatrolTaskPoints(tenantId, task.id);
    const previous = siblings.filter((item) => item.isRequired && item.sequenceNo < point.sequenceNo);
    const unfinished = previous.find((item) => !item.completedAt);
    if (unfinished) {
      throw new Error('請先完成上一巡邏點');
    }
  }
  return { allowLate, live };
}
