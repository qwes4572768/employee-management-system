import { formatUnitLabel, OCCUPANCY_TYPE_LABELS, UNIT_STATUS_LABELS, type OccupancyType, type UnitStatus } from '@/constants/community';
import { insertSiteUnit, listSiteUnits, updateSiteUnit } from '@/repositories/unitRepository';
import type { SiteUnit } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireCommunitySiteRecord, requireSiteUnitInTenant } from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

function blankToEmpty(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : '';
}

export async function createSiteUnit(
  actor: ActorContext,
  input: {
    siteId: string;
    building?: string | null;
    floor?: string | null;
    unitNo: string;
    displayName?: string | null;
    occupancyType?: OccupancyType;
    notes?: string | null;
  },
): Promise<SiteUnit> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'unit.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const unitError = required(input.unitNo, '戶號');
  if (unitError) throw new Error(unitError);
  const unitNo = input.unitNo.trim();
  const building = blankToEmpty(input.building);
  const floor = blankToEmpty(input.floor);
  const occupancyType = input.occupancyType ?? 'vacant';
  const displayName =
    input.displayName?.trim() ||
    formatUnitLabel({
      building,
      floor,
      unitNo,
    });
  let created: SiteUnit;
  try {
    created = await insertSiteUnit({
      tenantId,
      siteId: site.id,
      building,
      floor,
      unitNo,
      displayName,
      occupancyType,
      notes: input.notes?.trim() || null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) throw new Error('此戶別已存在');
    throw error;
  }
  await writeAudit({
    actor,
    action: 'create',
    module: 'unit',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」建立戶別「${created.displayName}」，現況為${OCCUPANCY_TYPE_LABELS[occupancyType]}。`,
    targetType: 'site_unit',
    targetId: created.id,
    targetDisplayName: created.displayName,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function listSiteUnitsForActor(
  actor: ActorContext,
  siteId?: string | null,
  status?: UnitStatus | null,
): Promise<SiteUnit[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'unit.view');
  if (siteId) {
    await requireSiteInTenant(siteId, tenantId);
    await requireActorSiteAccess(actor, siteId);
  }
  const rows = await listSiteUnits(tenantId, { siteId, status });
  if (siteId) return rows;
  const visible: SiteUnit[] = [];
  for (const row of rows) {
    try {
      await requireActorSiteAccess(actor, row.siteId);
      visible.push(row);
    } catch {
      continue;
    }
  }
  return visible;
}

export async function getSiteUnitForActor(actor: ActorContext, unitId: string): Promise<SiteUnit> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'unit.view');
  const unit = await requireSiteUnitInTenant(unitId, tenantId);
  return requireCommunitySiteRecord(actor, unit);
}

export async function updateSiteUnitForActor(
  actor: ActorContext,
  unitId: string,
  patch: {
    displayName?: string;
    occupancyType?: OccupancyType;
    status?: UnitStatus;
    notes?: string | null;
    building?: string | null;
    floor?: string | null;
    unitNo?: string;
  },
): Promise<SiteUnit> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'unit.manage');
  const current = await requireSiteUnitInTenant(unitId, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const site = await requireSiteInTenant(current.siteId, tenantId);
  let updated: SiteUnit;
  try {
    updated = await updateSiteUnit(unitId, tenantId, {
      ...patch,
      building: patch.building === undefined ? undefined : blankToEmpty(patch.building),
      floor: patch.floor === undefined ? undefined : blankToEmpty(patch.floor),
      unitNo: patch.unitNo?.trim(),
      displayName: patch.displayName?.trim(),
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) throw new Error('此戶別已存在');
    throw error;
  }
  await writeAudit({
    actor,
    action: 'update',
    module: 'unit',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新戶別「${updated.displayName}」，狀態為${UNIT_STATUS_LABELS[updated.status]}。`,
    targetType: 'site_unit',
    targetId: updated.id,
    targetDisplayName: updated.displayName,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}
