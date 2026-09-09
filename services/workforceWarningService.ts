import { ROLE_KEYS } from '@/constants/app';
import { STAFFING_MODES, type StaffingMode } from '@/constants/staffing';
import { WARNING_TYPES } from '@/constants/workforce';
import { getSiteById } from '@/repositories/siteRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import { listActiveSchedulesForUser } from '@/repositories/workforceRepository';
import { getEffectiveRoles } from '@/services/permissionService';
import type { WorkSchedule, WorkforceSettings, WorkforceWarning } from '@/types';
import { isWithinRange } from '@/utils/datetime';
import { addDays, formatDurationZh, formatHmFromIso, intervalsOverlap, minutesBetween, overlapRange } from '@/utils/scheduleTime';

export interface ScheduleDraft {
  userId: string;
  siteId: string;
  workDate: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  staffingMode: StaffingMode;
  excludeScheduleId?: string | null;
}

export function evaluateOverlap(newStart: Date, newEnd: Date, existingStart: Date, existingEnd: Date): boolean {
  return intervalsOverlap(newStart, newEnd, existingStart, existingEnd);
}

function toDate(value: string): Date {
  return new Date(value);
}

export async function evaluateScheduleWarnings(input: {
  tenantId: string;
  draft: ScheduleDraft;
  settings: WorkforceSettings;
  preferredOffDates?: string[];
}): Promise<WorkforceWarning[]> {
  const warnings: WorkforceWarning[] = [];
  const newStart = toDate(input.draft.scheduledStartAt);
  const newEnd = toDate(input.draft.scheduledEndAt);
  if (!(newEnd.getTime() > newStart.getTime())) {
    throw new Error('排班結束時間必須晚於開始時間');
  }

  const existing = (await listActiveSchedulesForUser(input.tenantId, input.draft.userId)).filter(
    (item) => item.id !== input.draft.excludeScheduleId,
  );

  for (const item of existing) {
    const existingStart = toDate(item.scheduledStartAt);
    const existingEnd = toDate(item.scheduledEndAt);
    const overlap = overlapRange(newStart, newEnd, existingStart, existingEnd);
    if (!overlap) continue;

    const existingSite = await getSiteById(item.siteId, input.tenantId);
    const newSite = await getSiteById(input.draft.siteId, input.tenantId);
    const isTrainee = input.draft.staffingMode === STAFFING_MODES.TRAINEE;
    warnings.push({
      type: isTrainee ? WARNING_TYPES.TRAINING_OVERLAP : WARNING_TYPES.SCHEDULE_OVERLAP,
      severity: isTrainee ? 'warning' : 'block',
      title: isTrainee ? '⚠ 見習重疊勤務' : '🔴 發現排班衝突',
      message: `重疊 ${formatDurationZh(overlap.minutes)}（${formatHmFromIso(overlap.start.toISOString())}～${formatHmFromIso(overlap.end.toISOString())}）`,
      overlap: {
        existingId: item.id,
        existingSiteId: item.siteId,
        existingSiteName: existingSite?.name ?? item.siteId,
        existingStartAt: item.scheduledStartAt,
        existingEndAt: item.scheduledEndAt,
        newSiteId: input.draft.siteId,
        newSiteName: newSite?.name ?? input.draft.siteId,
        newStartAt: input.draft.scheduledStartAt,
        newEndAt: input.draft.scheduledEndAt,
        overlapStartAt: overlap.start.toISOString(),
        overlapEndAt: overlap.end.toISOString(),
        overlapMinutes: overlap.minutes,
      },
    });
  }

  const rest = findInsufficientRest(newStart, newEnd, existing, input.settings.minimumRestMinutes);
  if (rest) {
    warnings.push({
      type: WARNING_TYPES.INSUFFICIENT_REST,
      severity: 'warning',
      title: '🟠 休息時間不足',
      message: `實際休息 ${formatDurationZh(rest.actualRestMinutes)}，最低要求 ${formatDurationZh(rest.minimumRestMinutes)}`,
      rest,
    });
  }

  if (input.settings.weeklyRestMode === 'standard_tw') {
    const weekly = evaluateWeeklyRest(input.draft.workDate, existing);
    if (weekly) {
      warnings.push(weekly);
    }
  }

  if (input.preferredOffDates?.includes(input.draft.workDate)) {
    warnings.push({
      type: WARNING_TYPES.WEEKLY_REST,
      severity: 'warning',
      title: '優先避免排班',
      message: '該日已核准指定休，建議改排其他人員或代班',
    });
  }

  return warnings;
}

function findInsufficientRest(
  newStart: Date,
  newEnd: Date,
  existing: WorkSchedule[],
  minimumRestMinutes: number,
) {
  let best: { previousEndAt: string | null; nextStartAt: string | null; actualRestMinutes: number; minimumRestMinutes: number } | null =
    null;

  const endingBefore = existing
    .map((item) => ({ item, end: toDate(item.scheduledEndAt) }))
    .filter((row) => row.end.getTime() <= newStart.getTime())
    .sort((a, b) => b.end.getTime() - a.end.getTime())[0];
  if (endingBefore) {
    const gap = minutesBetween(endingBefore.end, newStart);
    if (gap < minimumRestMinutes) {
      best = {
        previousEndAt: endingBefore.item.scheduledEndAt,
        nextStartAt: newStart.toISOString(),
        actualRestMinutes: gap,
        minimumRestMinutes,
      };
    }
  }

  const startingAfter = existing
    .map((item) => ({ item, start: toDate(item.scheduledStartAt) }))
    .filter((row) => row.start.getTime() >= newEnd.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (startingAfter) {
    const gap = minutesBetween(newEnd, startingAfter.start);
    if (gap < minimumRestMinutes) {
      const candidate = {
        previousEndAt: newEnd.toISOString(),
        nextStartAt: startingAfter.item.scheduledStartAt,
        actualRestMinutes: gap,
        minimumRestMinutes,
      };
      if (!best || candidate.actualRestMinutes < best.actualRestMinutes) {
        best = candidate;
      }
    }
  }

  return best;
}

function evaluateWeeklyRest(workDate: string, existing: WorkSchedule[]): WorkforceWarning | null {
  const windowStart = addDays(workDate, -6);
  const dates = new Set<string>([workDate]);
  for (const item of existing) {
    if (item.workDate >= windowStart && item.workDate <= workDate && item.leaveStatus !== 'leave_approved') {
      dates.add(item.workDate);
    }
  }
  if (dates.size <= 5) {
    return null;
  }
  return {
    type: WARNING_TYPES.WEEKLY_REST,
    severity: 'warning',
    title: '週休合規預警',
    message: `近 7 日已排 ${dates.size} 個工作日，台灣一般工時原則每 7 日應有 1 日例假與 1 日休息日`,
  };
}

export async function userHasSiteAuthorization(userId: string, tenantId: string, siteId: string): Promise<boolean> {
  const roles = await getEffectiveRoles(userId, tenantId);
  if (roles.some((role) => role.roleKey === ROLE_KEYS.SUPER_ADMIN)) {
    return true;
  }
  const grants = await listUserSitePermissions(userId, tenantId);
  const now = new Date();
  return grants.some(
    (grant) =>
      grant.siteId === siteId &&
      grant.status === 'active' &&
      isWithinRange(now, grant.startsAt, grant.expiresAt, grant.isPermanent),
  );
}

export const WorkforceWarningService = {
  evaluateOverlap,
  evaluateScheduleWarnings,
  userHasSiteAuthorization,
};
