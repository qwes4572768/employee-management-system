import { isStaffingMode, STAFFING_COVERAGE_STATUSES, UNSET_MINIMUM_HEADCOUNT_LABEL, UNSET_STAFFING_REQUIREMENT_LABEL, type StaffingMode } from '@/constants/staffing';
import { getSiteById } from '@/repositories/siteRepository';
import {
  getStaffingRequirementById,
  insertStaffingRequirement,
  listActiveStaffingRequirementsForSiteDate,
  listStaffingRequirements as listStaffingRequirementRows,
  softDeleteStaffingRequirement,
  updateStaffingRequirement,
} from '@/repositories/staffingRequirementRepository';
import { getShiftTemplateById, listSchedulesForSiteDate, listSchedulesForSiteRange } from '@/repositories/workforceRepository';
import type { ShiftCoverage, SiteShiftRequirement, StaffingCoverageStatus, WorkSchedule } from '@/types';
import { formatDateTimeZh, nowIso, parseDateOnly } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { actorPermissionKeys, requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorTenant, requireSiteInTenant, TenantAccessError } from './tenantGuard';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export { UNSET_MINIMUM_HEADCOUNT_LABEL, UNSET_STAFFING_REQUIREMENT_LABEL };

async function requireRequirementInTenant(id: string, tenantId: string): Promise<SiteShiftRequirement> {
  const item = await getStaffingRequirementById(id, tenantId);
  if (!item) {
    const existing = await getStaffingRequirementById(id);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到人力需求');
  }
  return item;
}

async function requireShiftTemplateInTenant(templateId: string, tenantId: string) {
  const template = await getShiftTemplateById(templateId, tenantId);
  if (!template) {
    const existing = await getShiftTemplateById(templateId);
    if (existing) throw new TenantAccessError();
    throw new Error('找不到班別');
  }
  return template;
}

function requireDateOnly(value: string, label: string): string {
  const trimmed = value.trim();
  const missing = required(trimmed, label);
  if (missing) throw new Error(missing);
  if (!DATE_ONLY.test(trimmed) || !parseDateOnly(trimmed)) {
    throw new Error(`${label}格式須為 YYYY-MM-DD`);
  }
  return trimmed;
}

function weekdayOf(workDate: string): number {
  const date = parseDateOnly(workDate);
  if (!date) throw new Error('勤務日期不正確');
  return date.getDay();
}

function matchesWeekday(requirement: SiteShiftRequirement, workDate: string): boolean {
  if (requirement.weekday == null) return true;
  return requirement.weekday === weekdayOf(workDate);
}

export function resolveRequirementForShift(
  candidates: SiteShiftRequirement[],
  shiftTemplateId: string | null,
  workDate: string,
): SiteShiftRequirement | null {
  const eligible = candidates.filter((item) => {
    if (!matchesWeekday(item, workDate)) return false;
    if (item.shiftTemplateId == null) return true;
    return item.shiftTemplateId === shiftTemplateId;
  });
  if (eligible.length === 0) return null;

  const scored = eligible.map((item) => {
    let score = 0;
    if (shiftTemplateId && item.shiftTemplateId === shiftTemplateId) score += 100;
    else if (item.shiftTemplateId == null) score += 10;
    if (item.weekday != null) score += 5;
    return { item, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.item.effectiveStartDate !== a.item.effectiveStartDate) {
      return b.item.effectiveStartDate.localeCompare(a.item.effectiveStartDate);
    }
    return b.item.updatedAt.localeCompare(a.item.updatedAt);
  });
  return scored[0]?.item ?? null;
}

function matchingSchedules(schedules: WorkSchedule[], shiftTemplateId: string | null, staffingMode: StaffingMode | null) {
  return schedules.filter((item) => {
    if (item.status === 'cancelled') return false;
    if ((item.shiftTemplateId ?? null) !== (shiftTemplateId ?? null)) return false;
    if (staffingMode && item.staffingModeSnapshot !== staffingMode) return false;
    return true;
  });
}

async function shiftLabel(tenantId: string, shiftTemplateId: string | null): Promise<string> {
  if (!shiftTemplateId) return '未指定班別';
  const template = await getShiftTemplateById(shiftTemplateId, tenantId);
  return template?.name ?? '未指定班別';
}

export async function computeShiftCoverage(input: {
  tenantId: string;
  siteId: string;
  workDate: string;
  shiftTemplateId?: string | null;
  treatUserIdAsUnavailable?: string | null;
}): Promise<ShiftCoverage> {
  const shiftTemplateId = input.shiftTemplateId ?? null;
  const site = await getSiteById(input.siteId, input.tenantId);
  const candidates = await listActiveStaffingRequirementsForSiteDate(input.tenantId, input.siteId, input.workDate);
  const requirement = resolveRequirementForShift(candidates, shiftTemplateId, input.workDate);
  const daySchedules = await listSchedulesForSiteDate(input.tenantId, input.siteId, input.workDate);
  const matched = matchingSchedules(daySchedules, shiftTemplateId, requirement?.staffingMode ?? null);
  const leavingId = input.treatUserIdAsUnavailable ?? null;
  const isUnavailable = (item: WorkSchedule) =>
    item.leaveStatus === 'leave_approved' || (leavingId != null && item.userId === leavingId);
  const scheduledHeadcount = matched.length;
  const approvedLeaveCount = matched.filter(isUnavailable).length;
  const remainingHeadcount = matched.filter((item) => !isUnavailable(item)).length;
  const scheduledAvailableHeadcount = matched.filter((item) => item.leaveStatus !== 'leave_approved').length;
  const requiredHeadcount = requirement?.requiredHeadcount ?? null;
  const shortage = requiredHeadcount == null ? 0 : Math.max(0, requiredHeadcount - remainingHeadcount);
  const surplus = requiredHeadcount == null ? 0 : Math.max(0, remainingHeadcount - requiredHeadcount);
  let status: StaffingCoverageStatus = STAFFING_COVERAGE_STATUSES.UNKNOWN;
  if (requiredHeadcount != null) {
    if (shortage > 0) status = STAFFING_COVERAGE_STATUSES.SHORT;
    else if (surplus > 0) status = STAFFING_COVERAGE_STATUSES.OVER;
    else status = STAFFING_COVERAGE_STATUSES.OK;
  }
  return {
    siteId: input.siteId,
    siteName: site?.name ?? input.siteId,
    shiftTemplateId,
    shiftName: await shiftLabel(input.tenantId, shiftTemplateId),
    workDate: input.workDate,
    requirement,
    requiredHeadcount,
    scheduledHeadcount,
    scheduledAvailableHeadcount,
    approvedLeaveCount,
    remainingHeadcount,
    shortage,
    surplus,
    status,
  };
}

export async function listSiteCoverages(input: {
  tenantId: string;
  siteId: string;
  startDate: string;
  endDate: string;
}): Promise<ShiftCoverage[]> {
  const site = await requireSiteInTenant(input.siteId, input.tenantId);
  const schedules = (await listSchedulesForSiteRange(input.tenantId, site.id, input.startDate, input.endDate)).filter(
    (item) => item.status !== 'cancelled',
  );
  const keys = new Set<string>();
  const slots: Array<{ workDate: string; shiftTemplateId: string | null }> = [];
  const remember = (workDate: string, shiftTemplateId: string | null) => {
    const key = `${workDate}|${shiftTemplateId ?? ''}`;
    if (keys.has(key)) return;
    keys.add(key);
    slots.push({ workDate, shiftTemplateId });
  };
  for (const schedule of schedules) {
    remember(schedule.workDate, schedule.shiftTemplateId);
  }
  let cursor = input.startDate;
  while (cursor <= input.endDate) {
    const requirements = await listActiveStaffingRequirementsForSiteDate(input.tenantId, site.id, cursor);
    for (const item of requirements) {
      if (!matchesWeekday(item, cursor)) continue;
      remember(cursor, item.shiftTemplateId);
    }
    const next = parseDateOnly(cursor);
    if (!next) break;
    next.setDate(next.getDate() + 1);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    cursor = `${y}-${m}-${d}`;
  }
  const coverages: ShiftCoverage[] = [];
  for (const slot of slots) {
    coverages.push(
      await computeShiftCoverage({
        tenantId: input.tenantId,
        siteId: site.id,
        workDate: slot.workDate,
        shiftTemplateId: slot.shiftTemplateId,
      }),
    );
  }
  return coverages;
}

export function summarizeCoverages(coverages: ShiftCoverage[]): {
  totalShortage: number;
  hasUnknown: boolean;
  allUnknown: boolean;
  knownCount: number;
} {
  const known = coverages.filter((item) => item.status !== STAFFING_COVERAGE_STATUSES.UNKNOWN);
  const totalShortage = known.reduce((sum, item) => sum + item.shortage, 0);
  const hasUnknown = coverages.some((item) => item.status === STAFFING_COVERAGE_STATUSES.UNKNOWN);
  return {
    totalShortage,
    hasUnknown,
    allUnknown: coverages.length === 0 || known.length === 0,
    knownCount: known.length,
  };
}

export function coverageResultLabel(coverage: ShiftCoverage, unsetLabel = UNSET_MINIMUM_HEADCOUNT_LABEL): string {
  if (coverage.status === STAFFING_COVERAGE_STATUSES.UNKNOWN) return unsetLabel;
  if (coverage.status === STAFFING_COVERAGE_STATUSES.SHORT) return `缺員 ${coverage.shortage}`;
  if (coverage.status === STAFFING_COVERAGE_STATUSES.OVER) return `已達標　超額${coverage.surplus}人`;
  return '已達標';
}

async function shiftDisplayName(tenantId: string, siteName: string, shiftTemplateId: string | null): Promise<string> {
  const shift = await shiftLabel(tenantId, shiftTemplateId);
  return `${siteName} / ${shift}`;
}

export async function listStaffingRequirements(actor: ActorContext, siteId?: string | null) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'staffingRequirement.view');
  if (siteId) {
    await requireSiteInTenant(siteId, tenantId);
  }
  return listStaffingRequirementRows(tenantId, siteId);
}

export async function getStaffingRequirement(actor: ActorContext, id: string) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'staffingRequirement.view');
  return requireRequirementInTenant(id, tenantId);
}

export async function getShiftCoverageForActor(
  actor: ActorContext,
  input: { siteId: string; workDate: string; shiftTemplateId?: string | null; treatUserIdAsUnavailable?: string | null },
): Promise<ShiftCoverage> {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  if (!keys.includes('staffingRequirement.view') && !keys.includes('schedule.view') && !keys.includes('leave.view')) {
    throw new Error('沒有此操作權限');
  }
  await requireSiteInTenant(input.siteId, tenantId);
  return computeShiftCoverage({
    tenantId,
    siteId: input.siteId,
    workDate: input.workDate,
    shiftTemplateId: input.shiftTemplateId,
    treatUserIdAsUnavailable: input.treatUserIdAsUnavailable,
  });
}

export async function listSiteCoveragesForActor(
  actor: ActorContext,
  input: { siteId: string; startDate: string; endDate: string },
): Promise<ShiftCoverage[]> {
  const tenantId = requireActorTenant(actor);
  const keys = await actorPermissionKeys(actor);
  if (!keys.includes('staffingRequirement.view') && !keys.includes('schedule.view')) {
    throw new Error('沒有此操作權限');
  }
  await requireSiteInTenant(input.siteId, tenantId);
  return listSiteCoverages({ tenantId, siteId: input.siteId, startDate: input.startDate, endDate: input.endDate });
}

export async function createStaffingRequirement(
  actor: ActorContext,
  input: {
    siteId: string;
    shiftTemplateId?: string | null;
    effectiveStartDate: string;
    effectiveEndDate?: string | null;
    requiredHeadcount: number;
    staffingMode?: StaffingMode | null;
    weekday?: number | null;
  },
): Promise<SiteShiftRequirement> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'staffingRequirement.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  if (input.shiftTemplateId) {
    await requireShiftTemplateInTenant(input.shiftTemplateId, tenantId);
  }
  const start = requireDateOnly(input.effectiveStartDate, '生效日');
  const end = input.effectiveEndDate?.trim() ? requireDateOnly(input.effectiveEndDate, '失效日') : null;
  if (end && end < start) {
    throw new Error('失效日不可早於生效日');
  }
  if (!Number.isInteger(input.requiredHeadcount) || input.requiredHeadcount < 0) {
    throw new Error('最低勤務人數須為 0 或正整數');
  }
  if (input.staffingMode != null && !isStaffingMode(input.staffingMode)) {
    throw new Error('勤務型態不正確');
  }
  if (input.weekday != null && (input.weekday < 0 || input.weekday > 6 || !Number.isInteger(input.weekday))) {
    throw new Error('星期設定不正確');
  }
  const created = await insertStaffingRequirement({
    tenantId,
    siteId: site.id,
    shiftTemplateId: input.shiftTemplateId ?? null,
    effectiveStartDate: start,
    effectiveEndDate: end,
    requiredHeadcount: input.requiredHeadcount,
    staffingMode: input.staffingMode ?? null,
    weekday: input.weekday ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const targetName = await shiftDisplayName(tenantId, site.name, created.shiftTemplateId);
  await writeAudit({
    actor,
    action: 'create',
    module: 'staffingRequirement',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 建立「${targetName}」最低勤務人數為 ${created.requiredHeadcount} 人。`,
    targetType: 'site_shift_requirement',
    targetId: created.id,
    targetDisplayName: targetName,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function editStaffingRequirement(
  actor: ActorContext,
  id: string,
  patch: Partial<{
    shiftTemplateId: string | null;
    effectiveStartDate: string;
    effectiveEndDate: string | null;
    requiredHeadcount: number;
    staffingMode: StaffingMode | null;
    weekday: number | null;
  }>,
): Promise<SiteShiftRequirement> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'staffingRequirement.manage');
  const before = await requireRequirementInTenant(id, tenantId);
  const site = await requireSiteInTenant(before.siteId, tenantId);
  if (patch.shiftTemplateId) {
    await requireShiftTemplateInTenant(patch.shiftTemplateId, tenantId);
  }
  if (patch.effectiveStartDate) {
    requireDateOnly(patch.effectiveStartDate, '生效日');
  }
  if (patch.effectiveEndDate) {
    requireDateOnly(patch.effectiveEndDate, '失效日');
  }
  const start = patch.effectiveStartDate ?? before.effectiveStartDate;
  const end = patch.effectiveEndDate === undefined ? before.effectiveEndDate : patch.effectiveEndDate;
  if (end && end < start) {
    throw new Error('失效日不可早於生效日');
  }
  if (patch.requiredHeadcount != null && (!Number.isInteger(patch.requiredHeadcount) || patch.requiredHeadcount < 0)) {
    throw new Error('最低勤務人數須為 0 或正整數');
  }
  if (patch.staffingMode != null && !isStaffingMode(patch.staffingMode)) {
    throw new Error('勤務型態不正確');
  }
  const after = await updateStaffingRequirement(id, tenantId, patch);
  const targetName = await shiftDisplayName(tenantId, site.name, after.shiftTemplateId);
  const changedHeadcount = patch.requiredHeadcount != null && patch.requiredHeadcount !== before.requiredHeadcount;
  const description = changedHeadcount
    ? `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 將「${targetName}」最低勤務人數由 ${before.requiredHeadcount} 人修改為 ${after.requiredHeadcount} 人。`
    : `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 修改「${targetName}」最低勤務人數設定。`;
  await writeAudit({
    actor,
    action: 'update',
    module: 'staffingRequirement',
    description,
    targetType: 'site_shift_requirement',
    targetId: after.id,
    targetDisplayName: targetName,
    before,
    after,
    siteId: site.id,
  });
  return after;
}

export async function deactivateStaffingRequirement(actor: ActorContext, id: string): Promise<SiteShiftRequirement> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'staffingRequirement.manage');
  const before = await requireRequirementInTenant(id, tenantId);
  const site = await requireSiteInTenant(before.siteId, tenantId);
  const after = await updateStaffingRequirement(id, tenantId, { status: 'inactive' });
  const targetName = await shiftDisplayName(tenantId, site.name, after.shiftTemplateId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'staffingRequirement',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 停用「${targetName}」最低勤務人數設定。`,
    targetType: 'site_shift_requirement',
    targetId: after.id,
    targetDisplayName: targetName,
    before,
    after,
    siteId: site.id,
  });
  return after;
}

export async function removeStaffingRequirement(actor: ActorContext, id: string): Promise<void> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'staffingRequirement.manage');
  const before = await requireRequirementInTenant(id, tenantId);
  const site = await requireSiteInTenant(before.siteId, tenantId);
  await softDeleteStaffingRequirement(id, tenantId);
  const targetName = await shiftDisplayName(tenantId, site.name, before.shiftTemplateId);
  await writeAudit({
    actor,
    action: 'delete',
    module: 'staffingRequirement',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 停用「${targetName}」最低勤務人數設定。`,
    targetType: 'site_shift_requirement',
    targetId: before.id,
    targetDisplayName: targetName,
    before,
    siteId: site.id,
  });
}
