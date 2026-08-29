import { listAttendanceForSiteDate, listAttendanceForUser } from '@/repositories/attendanceRepository';
import { getActiveWorkSession, listActiveWorkSessionsForSite } from '@/repositories/workSessionRepository';
import { getUserById } from '@/repositories/userRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { getShiftTemplateById, listSchedulesForSiteDate, listSchedulesForUserInRange } from '@/repositories/workforceRepository';
import type { AttendanceRecord, Site, User, WorkSchedule, WorkSession } from '@/types';
import { toDateOnly } from '@/utils/datetime';
import { formatDurationZh, formatHmFromIso, minutesBetween } from '@/utils/scheduleTime';

import type { ActorContext } from './actor';
import { actorPermissionKeys } from './access';
import { requireActorTenant } from './tenantGuard';
import { refreshSickLeaveOverdue } from './leaveService';
import { listSiteCoverages, summarizeCoverages } from './staffingRequirementService';

export type DutyStatus = 'not_arrived' | 'clocked_in' | 'on_duty' | 'duty_ended' | 'late' | 'exception';

export const DUTY_STATUS_LABELS: Record<DutyStatus, string> = {
  not_arrived: '尚未到班',
  clocked_in: '已打卡',
  on_duty: '勤務中',
  duty_ended: '勤務結束',
  late: '遲到',
  exception: '異常',
};

export interface OnDutyCard {
  user: User;
  site: Site | null;
  schedule: WorkSchedule | null;
  attendance: AttendanceRecord | null;
  session: WorkSession | null;
  status: DutyStatus;
  shiftName: string | null;
  elapsedLabel: string | null;
}

function resolveStatus(input: {
  schedule: WorkSchedule | null;
  attendance: AttendanceRecord | null;
  session: WorkSession | null;
}): DutyStatus {
  if (input.session?.status === 'active') return 'on_duty';
  if (input.attendance?.status === 'exception') return 'exception';
  if (input.attendance?.status === 'late') return 'late';
  if (input.session) return 'duty_ended';
  if (input.attendance?.clockInAt && !input.session) return 'clocked_in';
  return 'not_arrived';
}

async function enrich(
  user: User,
  site: Site | null,
  schedule: WorkSchedule | null,
  attendance: AttendanceRecord | null,
  session: WorkSession | null,
  now: Date,
): Promise<OnDutyCard> {
  const shiftName = schedule?.shiftTemplateId
    ? (await getShiftTemplateById(schedule.shiftTemplateId, user.tenantId))?.name ?? null
    : null;
  return {
    user,
    site,
    schedule,
    attendance,
    session,
    status: resolveStatus({ schedule, attendance, session }),
    shiftName,
    elapsedLabel:
      session?.status === 'active'
        ? formatDurationZh(Math.max(0, minutesBetween(new Date(session.startedAt), now)))
        : session
          ? `${formatHmFromIso(session.startedAt)}～${session.endedAt ? formatHmFromIso(session.endedAt) : '—'}`
          : null,
  };
}

export async function getPersonDutyCard(
  tenantId: string,
  userId: string,
  at: Date = new Date(),
): Promise<OnDutyCard | null> {
  const user = await getUserById(userId, tenantId);
  if (!user) return null;
  const today = toDateOnly(at);
  const schedules = (await listSchedulesForUserInRange(tenantId, user.id, today, today)).filter(
    (item) => item.status !== 'cancelled',
  );
  const schedule = schedules[0] ?? null;
  const site = schedule?.siteId
    ? await getSiteById(schedule.siteId, tenantId)
    : null;
  const attendanceList = await listAttendanceForUser(tenantId, user.id);
  const attendance =
    attendanceList.find(
      (item) =>
        (schedule && item.scheduleId === schedule.id) ||
        (item.clockInAt?.startsWith(today) ?? false),
    ) ?? null;
  const session = await getActiveWorkSession(tenantId, user.id);
  return enrich(user, site ?? (session ? await getSiteById(session.siteId, tenantId) : null), schedule, attendance, session, at);
}

export interface DashboardStaffingStats {
  shortage: number;
  unknown: boolean;
  allUnknown: boolean;
  knownCount: number;
}

export async function getDashboardSnapshot(
  actor: ActorContext,
  input: { siteId?: string | null; at?: Date },
): Promise<{
  primary: OnDutyCard | null;
  others: OnDutyCard[];
  managerStats: { expected: number; arrived: number; onDuty: number; late: number; missing: number } | null;
  staffingStats: DashboardStaffingStats | null;
}> {
  const tenantId = requireActorTenant(actor);
  const now = input.at ?? new Date();
  const today = toDateOnly(now);
  await refreshSickLeaveOverdue(tenantId, now);
  const keys = await actorPermissionKeys(actor);
  const canViewTeam = keys.includes('schedule.view') || keys.includes('attendance.view') || keys.includes('workSession.view');

  if (!actor.userId) {
    return {
      primary: null,
      others: [],
      managerStats: canViewTeam ? { expected: 0, arrived: 0, onDuty: 0, late: 0, missing: 0 } : null,
      staffingStats: null,
    };
  }
  const self = await getUserById(actor.userId, tenantId);
  if (!self) {
    return { primary: null, others: [], managerStats: null, staffingStats: null };
  }

  const siteId = input.siteId ?? actor.siteId;
  const site = siteId ? await getSiteById(siteId, tenantId) : null;
  const mySchedules = await listSchedulesForUserInRange(tenantId, self.id, today, today);
  const mySchedule = mySchedules.find((item) => item.status !== 'cancelled') ?? null;
  const myAttendanceList = await listAttendanceForUser(tenantId, self.id);
  const myAttendance =
    myAttendanceList.find((item) => (mySchedule && item.scheduleId === mySchedule.id) || (site && item.siteId === site.id && item.clockInAt?.startsWith(today))) ??
    myAttendanceList[0] ??
    null;
  const mySession = await getActiveWorkSession(tenantId, self.id);
  const primary = await enrich(self, site, mySchedule, myAttendance, mySession, now);

  const others: OnDutyCard[] = [];
  let managerStats: { expected: number; arrived: number; onDuty: number; late: number; missing: number } | null = null;
  let staffingStats: DashboardStaffingStats | null = null;

  if (canViewTeam && site) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const schedules = (await listSchedulesForSiteDate(tenantId, site.id, today)).filter(
      (item) => item.status !== 'cancelled',
    );
    const attendances = await listAttendanceForSiteDate(tenantId, site.id, dayStart, dayEnd);
    const sessions = await listActiveWorkSessionsForSite(tenantId, site.id);
    const expectedPeople = schedules.filter((item) => item.leaveStatus !== 'leave_approved');
    const expected = expectedPeople.length;
    const arrivedIds = new Set(attendances.filter((item) => item.clockInAt).map((item) => item.userId));
    const onDuty = sessions.length;
    const late = attendances.filter((item) => item.status === 'late').length;
    const missing = expectedPeople.filter((item) => !arrivedIds.has(item.userId)).length;
    managerStats = { expected, arrived: arrivedIds.size, onDuty, late, missing };
    const coverages = await listSiteCoverages({
      tenantId,
      siteId: site.id,
      startDate: today,
      endDate: today,
    });
    const summary = summarizeCoverages(coverages);
    staffingStats = {
      shortage: summary.totalShortage,
      unknown: summary.hasUnknown,
      allUnknown: summary.allUnknown,
      knownCount: summary.knownCount,
    };

    const seen = new Set<string>([self.id]);
    for (const schedule of expectedPeople) {
      if (seen.has(schedule.userId)) continue;
      seen.add(schedule.userId);
      const user = await getUserById(schedule.userId, tenantId);
      if (!user) continue;
      const attendance = attendances.find((item) => item.userId === user.id) ?? null;
      const session = sessions.find((item) => item.userId === user.id) ?? null;
      others.push(await enrich(user, site, schedule, attendance, session, now));
    }
  }

  return { primary, others, managerStats, staffingStats };
}
