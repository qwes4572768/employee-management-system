import {
  getActiveWorkSession,
  getWorkSessionById,
  insertWorkSession,
  updateWorkSession,
} from '@/repositories/workSessionRepository';
import { getOpenAttendance } from '@/repositories/attendanceRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getWorkScheduleById } from '@/repositories/workforceRepository';
import type { WorkSession } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { formatDurationZh, minutesBetween } from '@/utils/scheduleTime';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorTenant, requireSiteInTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';
import { userHasSiteAuthorization } from './workforceWarningService';

export class ActiveSessionConflictError extends Error {
  readonly session: WorkSession;
  constructor(message: string, session: WorkSession) {
    super(message);
    this.name = 'ActiveSessionConflictError';
    this.session = session;
  }
}

export async function startWorkSession(
  actor: ActorContext,
  input: {
    siteId: string;
    scheduleId?: string | null;
    unscheduled?: boolean;
    note?: string | null;
    at?: string;
  },
): Promise<WorkSession> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) throw new Error('缺少操作者');
  const user = await requireUserInTenant(actor.userId, tenantId);
  const site = await requireSiteInTenant(input.siteId, tenantId);
  if (!(await userHasSiteAuthorization(user.id, tenantId, site.id))) {
    throw new Error('沒有此案場授權');
  }
  const active = await getActiveWorkSession(tenantId, user.id);
  if (active) {
    const currentSite = await getSiteById(active.siteId, tenantId);
    const started = new Date(active.startedAt);
    const elapsed = minutesBetween(started, new Date(input.at ?? nowIso()));
    throw new ActiveSessionConflictError(
      `您目前仍在「${currentSite?.name ?? '其他案場'}」勤務中。\n開始時間：${formatDateTimeZh(active.startedAt)}\n勤務時間：${formatDurationZh(elapsed)}`,
      active,
    );
  }

  let schedule = input.scheduleId ? await getWorkScheduleById(input.scheduleId, tenantId) : null;
  if (input.scheduleId && !schedule) {
    const existing = await getWorkScheduleById(input.scheduleId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到排班');
  }
  const unscheduled = Boolean(input.unscheduled) || !schedule;
  if (unscheduled) {
    await requireActorPermission(actor, 'workSession.startUnscheduled');
  } else {
    await requireActorPermission(actor, 'workSession.start');
  }
  const attendance = await getOpenAttendance(tenantId, user.id, site.id);
  const startedAt = input.at ?? nowIso();
  let session: WorkSession;
  try {
    session = await insertWorkSession({
      tenantId,
      siteId: site.id,
      userId: user.id,
      scheduleId: schedule?.id ?? null,
      attendanceId: attendance?.id ?? null,
      startedAt,
      startMethod: 'manual',
      unscheduled,
      note: input.note ?? (unscheduled ? 'unscheduled' : null),
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|unique/i.test(text)) {
      const again = await getActiveWorkSession(tenantId, user.id);
      if (again) {
        throw new ActiveSessionConflictError('同一時間只能有一筆進行中的勤務', again);
      }
    }
    throw error;
  }

  await writeAudit({
    actor,
    action: 'create',
    module: 'workSession',
    description: unscheduled
      ? `${actor.fullName} 於 ${formatDateTimeZh(startedAt)} 未依排班開始臨時勤務（${site.name}）`
      : `${actor.fullName} 於 ${formatDateTimeZh(startedAt)} 開始勤務（${site.name}）`,
    targetType: 'work_session',
    targetId: session.id,
    targetDisplayName: user.fullName,
    after: session,
    siteId: site.id,
  });
  return session;
}

export async function endWorkSession(
  actor: ActorContext,
  input?: { sessionId?: string; at?: string; note?: string | null },
): Promise<{ session: WorkSession; missingClockOut: boolean }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'workSession.end');
  if (!actor.userId) throw new Error('缺少操作者');
  const user = await requireUserInTenant(actor.userId, tenantId);
  const session = input?.sessionId
    ? await getWorkSessionById(input.sessionId, tenantId)
    : await getActiveWorkSession(tenantId, user.id);
  if (!session) {
    if (input?.sessionId) {
      const existing = await getWorkSessionById(input.sessionId);
      if (existing) throw new TenantAccessError();
    }
    throw new Error('目前沒有進行中的勤務');
  }
  if (session.userId !== user.id) {
    throw new Error('只能結束自己的勤務');
  }
  if (session.status !== 'active') {
    throw new Error('此勤務已結束');
  }
  const endedAt = input?.at ?? nowIso();
  const updated = await updateWorkSession(session.id, tenantId, {
    endedAt,
    endMethod: 'manual',
    status: 'completed',
    note: input?.note ?? session.note,
  });
  const open = await getOpenAttendance(tenantId, user.id, session.siteId);
  const missingClockOut = Boolean(open && !open.clockOutAt);
  const site = await getSiteById(session.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'workSession',
    description: `${actor.fullName} 於 ${formatDateTimeZh(endedAt)} 結束勤務（${site?.name ?? session.siteId}）`,
    targetType: 'work_session',
    targetId: updated.id,
    targetDisplayName: user.fullName,
    after: updated,
    siteId: session.siteId,
  });
  return { session: updated, missingClockOut };
}

export async function forceEndWorkSession(
  actor: ActorContext,
  sessionId: string,
  note: string,
): Promise<WorkSession> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'workSession.forceEnd');
  const session = await getWorkSessionById(sessionId, tenantId);
  if (!session) {
    const existing = await getWorkSessionById(sessionId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到勤務階段');
  }
  if (!note.trim()) throw new Error('強制結束必須填寫原因');
  const updated = await updateWorkSession(sessionId, tenantId, {
    endedAt: nowIso(),
    endMethod: 'force',
    status: 'forced_closed',
    note: note.trim(),
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'workSession',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 強制結束勤務，原因：${note.trim()}`,
    targetType: 'work_session',
    targetId: updated.id,
    after: updated,
    siteId: session.siteId,
  });
  return updated;
}

export { getActiveWorkSession, getWorkSessionById };
