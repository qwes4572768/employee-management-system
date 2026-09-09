import { STAFFING_MODES } from '@/constants/staffing';
import { SCHEDULE_TYPES, WARNING_TYPES, type ScheduleType } from '@/constants/workforce';
import { getUserById, updateUserProfile } from '@/repositories/userRepository';
import {
  ensureTenantWorkforceDefaults,
  requireWorkforceSettings,
  getShiftTemplateById,
  getWorkScheduleById,
  insertShiftTemplate,
  insertWorkSchedule,
  listSchedulesForSiteRange,
  listSchedulesForUserInRange,
  listShiftTemplates,
  updateShiftTemplate,
  updateWorkSchedule,
  updateWorkforceSettings,
} from '@/repositories/workforceRepository';
import { listPreferredDaysOff } from '@/repositories/leaveRepository';
import type { ShiftTemplate, WorkSchedule, WorkforceWarning } from '@/types';
import { formatDateTimeZh, nowIso, toDateOnly } from '@/utils/datetime';
import { required } from '@/utils/validation';
import { addDays, buildShiftRange, shiftIsoByDays, yearMonthOf } from '@/utils/scheduleTime';

import type { ActorContext } from './actor';
import { actorPermissionKeys, requireActorPermission } from './access';
import { writeAudit } from './auditService';
import { requireActorTenant, requireSiteInTenant, requireUserInTenant, TenantAccessError } from './tenantGuard';
import { evaluateScheduleWarnings, userHasSiteAuthorization } from './workforceWarningService';

export class ScheduleDecisionError extends Error {
  readonly warnings: WorkforceWarning[];
  readonly code: 'blocked' | 'needs_confirmation';

  constructor(message: string, warnings: WorkforceWarning[], code: 'blocked' | 'needs_confirmation') {
    super(message);
    this.name = 'ScheduleDecisionError';
    this.warnings = warnings;
    this.code = code;
  }
}

export async function setUserStaffingMode(actor: ActorContext, userId: string, mode: typeof STAFFING_MODES[keyof typeof STAFFING_MODES]) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'users.update');
  const before = await requireUserInTenant(userId, tenantId);
  const after = await updateUserProfile(userId, { staffingMode: mode });
  await writeAudit({
    actor,
    action: 'update',
    module: 'users',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 將「${after.fullName}」勤務型態設為 ${mode}`,
    targetType: 'user',
    targetId: after.id,
    targetDisplayName: after.fullName,
    before,
    after,
  });
  return after;
}

export async function createShiftTemplate(
  actor: ActorContext,
  input: {
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    siteId?: string | null;
    startsAt?: string | null;
    expiresAt?: string | null;
  },
): Promise<ShiftTemplate> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'schedule.create');
  const nameError = required(input.name, '班別名稱');
  const codeError = required(input.code, '班別代碼');
  if (nameError || codeError) {
    throw new Error(nameError ?? codeError ?? '班別資料不完整');
  }
  if (input.siteId) {
    await requireSiteInTenant(input.siteId, tenantId);
  }
  const range = buildShiftRange({
    workDate: '2026-01-01',
    startTime: input.startTime,
    endTime: input.endTime,
  });
  const template = await insertShiftTemplate({
    tenantId,
    siteId: input.siteId ?? null,
    name: input.name,
    code: input.code,
    startTime: input.startTime,
    endTime: input.endTime,
    crossesMidnight: range.crossesMidnight,
    plannedMinutes: range.plannedMinutes,
    startsAt: input.startsAt ?? null,
    expiresAt: input.expiresAt ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'schedule',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 建立班別「${template.name}」（${template.startTime}～${template.endTime}）`,
    targetType: 'shift_template',
    targetId: template.id,
    targetDisplayName: template.name,
    after: template,
  });
  return template;
}

export async function editShiftTemplate(
  actor: ActorContext,
  templateId: string,
  patch: Partial<{
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    siteId: string | null;
    status: 'active' | 'inactive';
  }>,
): Promise<ShiftTemplate> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'schedule.update');
  const before = await getShiftTemplateById(templateId, tenantId);
  if (!before) {
    const existing = await getShiftTemplateById(templateId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到班別');
  }
  const startTime = patch.startTime ?? before.startTime;
  const endTime = patch.endTime ?? before.endTime;
  const range = buildShiftRange({ workDate: '2026-01-01', startTime, endTime });
  const after = await updateShiftTemplate(templateId, tenantId, {
    ...patch,
    startTime,
    endTime,
    crossesMidnight: range.crossesMidnight,
    plannedMinutes: range.plannedMinutes,
  });
  const verb = patch.status === 'inactive' ? '停用' : '修改';
  await writeAudit({
    actor,
    action: 'update',
    module: 'schedule',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${verb}班別「${after.name}」`,
    targetType: 'shift_template',
    targetId: after.id,
    targetDisplayName: after.name,
    before,
    after,
  });
  return after;
}

export interface CreateScheduleInput {
  userId: string;
  siteId: string;
  workDate: string;
  shiftTemplateId?: string | null;
  startTime?: string;
  endTime?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  scheduleType?: ScheduleType;
  allowTrainingOverlap?: boolean;
  trainerUserId?: string | null;
  trainingReason?: string | null;
  restOverrideReason?: string | null;
  weeklyRestOverrideReason?: string | null;
  note?: string | null;
}

async function resolveScheduleTimes(tenantId: string, input: CreateScheduleInput) {
  if (input.scheduledStartAt && input.scheduledEndAt) {
    const start = new Date(input.scheduledStartAt);
    const end = new Date(input.scheduledEndAt);
    if (!(end.getTime() > start.getTime())) {
      throw new Error('排班結束時間必須晚於開始時間');
    }
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      templateId: input.shiftTemplateId ?? null,
    };
  }
  let startTime = input.startTime;
  let endTime = input.endTime;
  let templateId = input.shiftTemplateId ?? null;
  if (input.shiftTemplateId) {
    const template = await getShiftTemplateById(input.shiftTemplateId, tenantId);
    if (!template) throw new Error('找不到班別');
    startTime = startTime ?? template.startTime;
    endTime = endTime ?? template.endTime;
    templateId = template.id;
  }
  if (!startTime || !endTime) {
    throw new Error('請指定班別或開始／結束時間');
  }
  const range = buildShiftRange({ workDate: input.workDate, startTime, endTime });
  return { startIso: range.start.toISOString(), endIso: range.end.toISOString(), templateId };
}

export async function previewSchedule(
  actor: ActorContext,
  input: CreateScheduleInput,
): Promise<{ warnings: WorkforceWarning[]; blocked: boolean }> {
  const tenantId = requireActorTenant(actor);
  const user = await requireUserInTenant(input.userId, tenantId);
  await requireSiteInTenant(input.siteId, tenantId);
  const settings = await requireWorkforceSettings(tenantId);
  const times = await resolveScheduleTimes(tenantId, input);
  const preferred = await listPreferredDaysOff(tenantId, user.id, yearMonthOf(input.workDate));
  const warnings = await evaluateScheduleWarnings({
    tenantId,
    settings,
    preferredOffDates: preferred.filter((item) => item.status === 'approved').map((item) => item.offDate),
    draft: {
      userId: user.id,
      siteId: input.siteId,
      workDate: input.workDate,
      scheduledStartAt: times.startIso,
      scheduledEndAt: times.endIso,
      staffingMode: user.staffingMode,
    },
  });
  return { warnings, blocked: warnings.some((item) => item.severity === 'block') };
}

export async function createSchedule(actor: ActorContext, input: CreateScheduleInput): Promise<WorkSchedule> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'schedule.create');
  const user = await requireUserInTenant(input.userId, tenantId);
  const site = await requireSiteInTenant(input.siteId, tenantId);
  if (!(await userHasSiteAuthorization(user.id, tenantId, site.id))) {
    throw new Error('該人員沒有此案場授權，無法排班');
  }
  const settings = await requireWorkforceSettings(tenantId);
  const times = await resolveScheduleTimes(tenantId, input);
  const preferred = await listPreferredDaysOff(tenantId, user.id, yearMonthOf(input.workDate));
  const warnings = await evaluateScheduleWarnings({
    tenantId,
    settings,
    preferredOffDates: preferred.filter((item) => item.status === 'approved').map((item) => item.offDate),
    draft: {
      userId: user.id,
      siteId: site.id,
      workDate: input.workDate,
      scheduledStartAt: times.startIso,
      scheduledEndAt: times.endIso,
      staffingMode: user.staffingMode,
    },
  });

  const overlap = warnings.filter((item) => item.type === WARNING_TYPES.SCHEDULE_OVERLAP || item.type === WARNING_TYPES.TRAINING_OVERLAP);
  const rest = warnings.filter((item) => item.type === WARNING_TYPES.INSUFFICIENT_REST);
  const weekly = warnings.filter((item) => item.type === WARNING_TYPES.WEEKLY_REST);

  if (overlap.some((item) => item.severity === 'block')) {
    const first = overlap[0];
    await writeAudit({
      actor,
      action: 'reject',
      module: 'schedule',
      result: 'failure',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 因撞班拒絕為「${user.fullName}」建立排班（${site.name}）`,
      targetType: 'work_schedule',
      targetDisplayName: user.fullName,
      after: first?.overlap,
      siteId: site.id,
    });
    throw new ScheduleDecisionError('發現排班衝突，已禁止儲存', warnings, 'blocked');
  }

  if (overlap.length > 0) {
    if (user.staffingMode !== STAFFING_MODES.TRAINEE) {
      throw new ScheduleDecisionError('發現排班衝突，已禁止儲存', warnings, 'blocked');
    }
    if (!input.allowTrainingOverlap) {
      throw new ScheduleDecisionError('見習重疊勤務需主管明確允許', warnings, 'needs_confirmation');
    }
    if (!input.trainingReason?.trim()) {
      throw new ScheduleDecisionError('允許見習重疊必須填寫見習原因 / 備註', warnings, 'needs_confirmation');
    }
  }

  if (rest.length > 0 && !input.restOverrideReason?.trim()) {
    throw new ScheduleDecisionError('休息時間不足，強制排班需填寫理由', warnings, 'needs_confirmation');
  }
  if (weekly.length > 0 && !input.weeklyRestOverrideReason?.trim() && !input.restOverrideReason?.trim()) {
    throw new ScheduleDecisionError('週休合規預警，繼續排班需填寫理由', warnings, 'needs_confirmation');
  }

  let scheduleType = input.scheduleType ?? SCHEDULE_TYPES.NORMAL;
  if (user.staffingMode === STAFFING_MODES.MOBILE && scheduleType === SCHEDULE_TYPES.NORMAL && input.scheduleType === undefined) {
    scheduleType = SCHEDULE_TYPES.SUPPORT;
  }
  if (user.staffingMode === STAFFING_MODES.TRAINEE && input.allowTrainingOverlap) {
    scheduleType = SCHEDULE_TYPES.TRAINING;
  }

  const schedule = await insertWorkSchedule({
    tenantId,
    siteId: site.id,
    userId: user.id,
    shiftTemplateId: times.templateId,
    workDate: input.workDate,
    scheduledStartAt: times.startIso,
    scheduledEndAt: times.endIso,
    scheduleType,
    staffingModeSnapshot: user.staffingMode,
    allowTrainingOverlap: Boolean(input.allowTrainingOverlap),
    trainerUserId: input.trainerUserId ?? null,
    trainingReason: input.trainingReason ?? null,
    weeklyRestWarning: weekly.length > 0,
    note: input.note ?? null,
    overrideReason: input.restOverrideReason ?? input.weeklyRestOverrideReason ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });

  const at = formatDateTimeZh(nowIso());
  await writeAudit({
    actor,
    action: 'create',
    module: 'schedule',
    description: `${actor.fullName} 於 ${at} 為「${user.fullName}」建立排班（${site.name} ${input.workDate}）`,
    targetType: 'work_schedule',
    targetId: schedule.id,
    targetDisplayName: user.fullName,
    after: schedule,
    siteId: site.id,
  });

  if (input.allowTrainingOverlap && overlap.length > 0) {
    const detail = overlap[0]?.overlap;
    const trainer = input.trainerUserId ? await getUserById(input.trainerUserId, tenantId) : null;
    await writeAudit({
      actor,
      action: 'approve',
      module: 'schedule',
      description: `${actor.fullName} 於 ${at} 允許見習人員「${user.fullName}」建立重疊勤務排班。原案場：${detail?.existingSiteName ?? '—'}，新案場：${detail?.newSiteName ?? site.name}，重疊時間：${detail ? Math.round(detail.overlapMinutes / 60 * 10) / 10 : '—'}小時。原因：${input.trainingReason?.trim()}。${trainer ? `帶訓人員：${trainer.fullName}` : ''}`,
      targetType: 'work_schedule',
      targetId: schedule.id,
      targetDisplayName: user.fullName,
      after: { overlap: detail, trainerUserId: input.trainerUserId, reason: input.trainingReason },
      siteId: site.id,
    });
  }

  if (input.restOverrideReason?.trim() && rest.length > 0) {
    await writeAudit({
      actor,
      action: 'update',
      module: 'schedule',
      description: `${actor.fullName} 於 ${at} 於休息不足情況下仍為「${user.fullName}」排班，理由：${input.restOverrideReason.trim()}`,
      targetType: 'work_schedule',
      targetId: schedule.id,
      targetDisplayName: user.fullName,
      siteId: site.id,
    });
  }

  return schedule;
}

export async function cancelSchedule(actor: ActorContext, scheduleId: string, note?: string): Promise<WorkSchedule> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'schedule.cancel');
  const before = await getWorkScheduleById(scheduleId, tenantId);
  if (!before) {
    const existing = await getWorkScheduleById(scheduleId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到排班');
  }
  const after = await updateWorkSchedule(scheduleId, tenantId, {
    status: 'cancelled',
    note: note ?? before.note,
  });
  const user = await getUserById(after.userId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'schedule',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 取消「${user?.fullName ?? after.userId}」的排班`,
    targetType: 'work_schedule',
    targetId: after.id,
    targetDisplayName: user?.fullName ?? after.id,
    before,
    after,
    siteId: after.siteId,
  });
  return after;
}

export async function listMySchedules(
  actor: ActorContext,
  range: { startDate: string; endDate: string; userId?: string },
): Promise<WorkSchedule[]> {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  const userId = range.userId ?? actor.userId;
  if (!userId) throw new Error('缺少使用者');
  if (userId !== actor.userId && !keys.includes('schedule.view')) {
    throw new Error('沒有此操作權限');
  }
  if (userId === actor.userId && !keys.includes('schedule.viewOwn') && !keys.includes('schedule.view')) {
    throw new Error('沒有此操作權限');
  }
  await requireUserInTenant(userId, tenantId);
  return listSchedulesForUserInRange(tenantId, userId, range.startDate, range.endDate);
}

export async function listSiteSchedules(
  actor: ActorContext,
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<WorkSchedule[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'schedule.view');
  await requireSiteInTenant(siteId, tenantId);
  return listSchedulesForSiteRange(tenantId, siteId, startDate, endDate);
}

export async function getShiftTemplates(actor: ActorContext, siteId?: string | null): Promise<ShiftTemplate[]> {
  const tenantId = requireActorTenant(actor);
  return listShiftTemplates(tenantId, siteId);
}

export interface CopyCandidate {
  source: WorkSchedule;
  workDate: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  warnings: WorkforceWarning[];
  blocked: boolean;
}

export async function previewCopySchedules(
  actor: ActorContext,
  input: { siteId: string; sourceStart: string; sourceEnd: string; targetStart: string },
): Promise<{ ok: CopyCandidate[]; conflicts: CopyCandidate[] }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'schedule.create');
  await requireSiteInTenant(input.siteId, tenantId);
  const sources = (await listSchedulesForSiteRange(tenantId, input.siteId, input.sourceStart, input.sourceEnd)).filter(
    (item) => item.status !== 'cancelled',
  );
  const dayOffset =
    (new Date(input.targetStart).getTime() - new Date(input.sourceStart).getTime()) / 86400000;
  const offsetDays = Math.round(dayOffset);
  const ok: CopyCandidate[] = [];
  const conflicts: CopyCandidate[] = [];
  for (const source of sources) {
    const workDate = addDays(source.workDate, offsetDays);
    const scheduledStartAt = shiftIsoByDays(source.scheduledStartAt, offsetDays);
    const scheduledEndAt = shiftIsoByDays(source.scheduledEndAt, offsetDays);
    const user = await requireUserInTenant(source.userId, tenantId);
    const preview = await previewSchedule(actor, {
      userId: source.userId,
      siteId: source.siteId,
      workDate,
      scheduledStartAt,
      scheduledEndAt,
      scheduleType: source.scheduleType,
    });
    const authorized = await userHasSiteAuthorization(user.id, tenantId, source.siteId);
    const candidate: CopyCandidate = {
      source,
      workDate,
      scheduledStartAt,
      scheduledEndAt,
      warnings: preview.warnings,
      blocked: preview.blocked || !authorized,
    };
    if (!authorized) {
      candidate.warnings = [
        ...candidate.warnings,
        {
          type: WARNING_TYPES.SCHEDULE_OVERLAP,
          severity: 'block',
          title: '無案場授權',
          message: '該人員沒有此案場授權',
        },
      ];
    }
    if (candidate.blocked) conflicts.push(candidate);
    else ok.push(candidate);
  }
  return { ok, conflicts };
}

export async function commitCopySchedules(
  actor: ActorContext,
  input: { siteId: string; sourceStart: string; sourceEnd: string; targetStart: string; includeBlocked?: boolean },
): Promise<{ created: WorkSchedule[]; skipped: number }> {
  const preview = await previewCopySchedules(actor, input);
  const selected = input.includeBlocked ? [...preview.ok, ...preview.conflicts.filter((c) => !c.blocked)] : preview.ok;
  const created: WorkSchedule[] = [];
  for (const item of selected) {
    if (item.blocked) continue;
    const restNeed = item.warnings.some((w) => w.type === WARNING_TYPES.INSUFFICIENT_REST || w.type === WARNING_TYPES.WEEKLY_REST);
    created.push(
      await createSchedule(actor, {
        userId: item.source.userId,
        siteId: item.source.siteId,
        workDate: item.workDate,
        scheduledStartAt: item.scheduledStartAt,
        scheduledEndAt: item.scheduledEndAt,
        scheduleType: item.source.scheduleType,
        restOverrideReason: restNeed ? '批次複製並確認警告' : null,
        weeklyRestOverrideReason: restNeed ? '批次複製並確認警告' : null,
      }),
    );
  }
  await writeAudit({
    actor,
    action: 'create',
    module: 'schedule',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 批次排班：成功候選 ${preview.ok.length}、衝突 ${preview.conflicts.length}，實際建立 ${created.length} 筆`,
    targetType: 'work_schedule',
    targetDisplayName: '批次排班',
    after: { ok: preview.ok.length, conflicts: preview.conflicts.length, created: created.length },
    siteId: input.siteId,
  });
  return { created, skipped: preview.conflicts.length };
}

export async function copyDay(actor: ActorContext, siteId: string, sourceDate: string, targetDate: string) {
  return previewCopySchedules(actor, { siteId, sourceStart: sourceDate, sourceEnd: sourceDate, targetStart: targetDate });
}

export async function copyWeek(actor: ActorContext, siteId: string, sourceStart: string, targetStart: string) {
  return previewCopySchedules(actor, {
    siteId,
    sourceStart,
    sourceEnd: addDays(sourceStart, 6),
    targetStart,
  });
}

export async function copyMonth(actor: ActorContext, siteId: string, sourceMonthStart: string, targetMonthStart: string) {
  const sourceEndDate = new Date(sourceMonthStart);
  sourceEndDate.setMonth(sourceEndDate.getMonth() + 1);
  sourceEndDate.setDate(0);
  return previewCopySchedules(actor, {
    siteId,
    sourceStart: sourceMonthStart,
    sourceEnd: toDateOnly(sourceEndDate),
    targetStart: targetMonthStart,
  });
}

export async function saveWorkforceSettings(
  actor: ActorContext,
  patch: Parameters<typeof updateWorkforceSettings>[1],
) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'leave.policy.manage');
  const after = await updateWorkforceSettings(tenantId, patch);
  await writeAudit({
    actor,
    action: 'update',
    module: 'schedule',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 更新勤務設定`,
    targetType: 'workforce_settings',
    targetId: after.id,
    after,
  });
  return after;
}

export { getWorkScheduleById, listShiftTemplates, ensureTenantWorkforceDefaults };
