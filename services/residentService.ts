import { RESIDENT_RELATION_LABELS, type ResidentRelationKey, type ResidentStatus } from '@/constants/community';
import {
  endResidentOccupancy,
  getResidentById,
  insertResident,
  insertResidentOccupancy,
  listResidentOccupancies,
  listResidents,
  updateResident,
} from '@/repositories/residentRepository';
import type { Resident, ResidentOccupancy } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import {
  requireCommunitySiteRecord,
  requireOccupancyInTenant,
  requireResidentInTenant,
  requireSiteUnitInTenant,
} from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

function assertIdLast4(value?: string | null): string | null {
  const trimmed = value?.trim() || '';
  if (!trimmed) return null;
  if (!/^\d{4}$/.test(trimmed)) {
    throw new Error('身分證末四碼須為 4 位數字，系統不保存完整身分證號');
  }
  return trimmed;
}

export async function createResidentWithOccupancy(
  actor: ActorContext,
  input: {
    unitId: string;
    fullName: string;
    phone?: string | null;
    gender?: string | null;
    idLast4?: string | null;
    photoUri?: string | null;
    isPrimary?: boolean;
    moveInAt?: string | null;
    notes?: string | null;
    relationKey: ResidentRelationKey;
    occupancyNotes?: string | null;
  },
): Promise<{ resident: Resident; occupancy: ResidentOccupancy }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.manage');
  const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
  await requireActorSiteAccess(actor, unit.siteId);
  const nameError = required(input.fullName, '住戶姓名');
  if (nameError) throw new Error(nameError);
  const site = await requireSiteInTenant(unit.siteId, tenantId);
  const resident = await insertResident({
    tenantId,
    siteId: unit.siteId,
    unitId: unit.id,
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    gender: input.gender?.trim() || 'unspecified',
    idLast4: assertIdLast4(input.idLast4),
    photoUri: input.photoUri ?? null,
    isPrimary: input.isPrimary ?? false,
    moveInAt: input.moveInAt ?? nowIso(),
    notes: input.notes?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const occupancy = await insertResidentOccupancy({
    tenantId,
    siteId: unit.siteId,
    unitId: unit.id,
    residentId: resident.id,
    relationKey: input.relationKey,
    relationLabelSnapshot: RESIDENT_RELATION_LABELS[input.relationKey],
    startsAt: resident.moveInAt,
    isCurrent: true,
    notes: input.occupancyNotes?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'resident',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」為戶別「${unit.displayName}」建立住戶「${resident.fullName}」，關係為${RESIDENT_RELATION_LABELS[input.relationKey]}。`,
    targetType: 'resident',
    targetId: resident.id,
    targetDisplayName: resident.fullName,
    after: { resident, occupancy },
    siteId: site.id,
  });
  return { resident, occupancy };
}

export async function addResidentOccupancyForActor(
  actor: ActorContext,
  input: {
    residentId: string;
    unitId: string;
    relationKey: ResidentRelationKey;
    startsAt?: string | null;
    notes?: string | null;
  },
): Promise<ResidentOccupancy> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.manage');
  const resident = await requireResidentInTenant(input.residentId, tenantId);
  await requireActorSiteAccess(actor, resident.siteId);
  const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
  await requireActorSiteAccess(actor, unit.siteId);
  if (unit.siteId !== resident.siteId) {
    throw new Error('住戶與戶別必須屬於同一案場');
  }
  const current = await listResidentOccupancies(tenantId, {
    unitId: unit.id,
    residentId: resident.id,
    currentOnly: true,
  });
  if (current.some((item) => item.relationKey === input.relationKey)) {
    throw new Error('此住戶在該戶別已有相同關係');
  }
  const occupancy = await insertResidentOccupancy({
    tenantId,
    siteId: unit.siteId,
    unitId: unit.id,
    residentId: resident.id,
    relationKey: input.relationKey,
    relationLabelSnapshot: RESIDENT_RELATION_LABELS[input.relationKey],
    startsAt: input.startsAt ?? nowIso(),
    isCurrent: true,
    notes: input.notes?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(unit.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'occupancy.add',
    module: 'resident',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」為住戶「${resident.fullName}」新增「${unit.displayName}」${RESIDENT_RELATION_LABELS[input.relationKey]}關係。`,
    targetType: 'resident_occupancy',
    targetId: occupancy.id,
    targetDisplayName: `${resident.fullName}／${unit.displayName}`,
    after: occupancy,
    siteId: site.id,
  });
  return occupancy;
}

export async function endResidentOccupancyForActor(
  actor: ActorContext,
  occupancyId: string,
  endsAt?: string,
): Promise<ResidentOccupancy> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.manage');
  const occupancy = await requireOccupancyInTenant(occupancyId, tenantId);
  await requireActorSiteAccess(actor, occupancy.siteId);
  if (!occupancy.isCurrent) {
    throw new Error('此關係已結束');
  }
  const endedAt = endsAt ?? nowIso();
  await endResidentOccupancy(occupancy.id, tenantId, endedAt);
  const next = await requireOccupancyInTenant(occupancy.id, tenantId);
  const site = await requireSiteInTenant(occupancy.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'occupancy.end',
    module: 'resident',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」結束一筆${occupancy.relationLabelSnapshot}關係。`,
    targetType: 'resident_occupancy',
    targetId: occupancy.id,
    before: occupancy,
    after: next,
    siteId: site.id,
  });
  return next;
}

export async function listResidentsForActor(
  actor: ActorContext,
  input?: { siteId?: string | null; unitId?: string | null; status?: ResidentStatus | null },
): Promise<Resident[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.view');
  if (input?.siteId) {
    await requireActorSiteAccess(actor, input.siteId);
  }
  if (input?.unitId) {
    const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
    await requireActorSiteAccess(actor, unit.siteId);
  }
  const rows = await listResidents(tenantId, input);
  const visible: Resident[] = [];
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

export async function getResidentForActor(
  actor: ActorContext,
  residentId: string,
): Promise<{ resident: Resident; occupancies: ResidentOccupancy[] }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.view');
  const resident = await requireCommunitySiteRecord(actor, await requireResidentInTenant(residentId, tenantId));
  const occupancies = await listResidentOccupancies(tenantId, { residentId: resident.id });
  return { resident, occupancies };
}

export async function listUnitOccupanciesForActor(
  actor: ActorContext,
  unitId: string,
  currentOnly = true,
): Promise<Array<{ occupancy: ResidentOccupancy; resident: Resident | null }>> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.view');
  const unit = await requireSiteUnitInTenant(unitId, tenantId);
  await requireActorSiteAccess(actor, unit.siteId);
  const occupancies = await listResidentOccupancies(tenantId, { unitId: unit.id, currentOnly });
  const rows: Array<{ occupancy: ResidentOccupancy; resident: Resident | null }> = [];
  for (const occupancy of occupancies) {
    rows.push({ occupancy, resident: await getResidentById(occupancy.residentId, tenantId) });
  }
  return rows;
}

export async function updateResidentForActor(
  actor: ActorContext,
  residentId: string,
  patch: Partial<Pick<Resident, 'fullName' | 'phone' | 'gender' | 'idLast4' | 'photoUri' | 'isPrimary' | 'status' | 'notes'>>,
): Promise<Resident> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'resident.manage');
  const current = await requireResidentInTenant(residentId, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  if (patch.idLast4 !== undefined) {
    patch = { ...patch, idLast4: assertIdLast4(patch.idLast4) };
  }
  const updated = await updateResident(residentId, tenantId, patch);
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'resident',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新住戶「${updated.fullName}」。`,
    targetType: 'resident',
    targetId: updated.id,
    targetDisplayName: updated.fullName,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}
