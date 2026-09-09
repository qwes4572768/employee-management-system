import {
  DEFAULT_VISITOR_MAX_DURATION_MINUTES,
  PARKING_ASSIGNMENT_TYPE_LABELS,
  PARKING_SPACE_TYPE_LABELS,
  formatParkingSpaceLabel,
  type ParkingAssignmentType,
  type ParkingSpaceStatus,
  type ParkingSpaceType,
  type ParkingVehicleType,
} from '@/constants/mobility';
import {
  endParkingAssignment,
  getSiteParkingSettings,
  insertParkingAssignment,
  insertParkingSpace,
  listParkingAssignments,
  listParkingSpaces,
  updateParkingSpace,
  upsertSiteParkingSettings,
} from '@/repositories/parkingRepository';
import type { ParkingAssignment, ParkingSpace, SiteParkingSettings } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import {
  requireCommunitySiteRecord,
  requireCurrentOccupancy,
  requireParkingAssignmentInTenant,
  requireParkingSpaceInTenant,
  requireResidentInTenant,
  requireSiteUnitInTenant,
} from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

async function uniqueOrThrow<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) throw new Error(message);
    throw error;
  }
}

export async function createParkingSpaceForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    zone?: string | null;
    floor?: string | null;
    spaceNo: string;
    displayName?: string | null;
    spaceType: ParkingSpaceType;
    vehicleType?: ParkingVehicleType;
    notes?: string | null;
  },
): Promise<ParkingSpace> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingSpace.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const noError = required(input.spaceNo, '車位編號');
  if (noError) throw new Error(noError);
  const zone = input.zone?.trim() || null;
  const floor = input.floor?.trim() || null;
  const spaceNo = input.spaceNo.trim();
  const duplicated = (await listParkingSpaces(tenantId, { siteId: site.id, status: 'active' })).some(
    (item) => (item.zone ?? '') === (zone ?? '') && (item.floor ?? '') === (floor ?? '') && item.spaceNo === spaceNo,
  );
  if (duplicated) throw new Error('此車位編號已存在');
  const space = await uniqueOrThrow(
    () =>
      insertParkingSpace({
        tenantId,
        siteId: site.id,
        zone,
        floor,
        spaceNo,
        displayName: formatParkingSpaceLabel({
          zone,
          floor,
          spaceNo,
          displayName: input.displayName,
        }),
        spaceType: input.spaceType,
        vehicleType: input.vehicleType,
        notes: input.notes?.trim() || null,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      }),
    '此車位編號已存在',
  );
  await writeAudit({
    actor,
    action: 'create',
    module: 'parkingSpace',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」建立車位「${space.displayName}」（${PARKING_SPACE_TYPE_LABELS[space.spaceType]}）。`,
    targetType: 'parking_space',
    targetId: space.id,
    targetDisplayName: space.displayName,
    after: space,
    siteId: site.id,
  });
  return space;
}

export async function listParkingSpacesForActor(
  actor: ActorContext,
  input?: { siteId?: string | null; status?: ParkingSpaceStatus | null },
): Promise<ParkingSpace[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingSpace.view');
  if (input?.siteId) await requireActorSiteAccess(actor, input.siteId);
  const rows = await listParkingSpaces(tenantId, input);
  const visible: ParkingSpace[] = [];
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

export async function getParkingSpaceForActor(actor: ActorContext, id: string): Promise<ParkingSpace> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingSpace.view');
  return requireCommunitySiteRecord(actor, await requireParkingSpaceInTenant(id, tenantId));
}

export async function updateParkingSpaceForActor(
  actor: ActorContext,
  id: string,
  patch: Partial<Pick<ParkingSpace, 'zone' | 'floor' | 'spaceNo' | 'displayName' | 'spaceType' | 'vehicleType' | 'status' | 'notes'>>,
): Promise<ParkingSpace> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingSpace.manage');
  const current = await requireParkingSpaceInTenant(id, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const next = {
    ...patch,
    displayName:
      patch.displayName ??
      formatParkingSpaceLabel({
        zone: patch.zone === undefined ? current.zone : patch.zone,
        floor: patch.floor === undefined ? current.floor : patch.floor,
        spaceNo: patch.spaceNo ?? current.spaceNo,
        displayName: patch.displayName,
      }),
  };
  const updated = await uniqueOrThrow(
    () => updateParkingSpace(id, tenantId, next),
    '此車位編號已存在',
  );
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'parkingSpace',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新車位「${updated.displayName}」。`,
    targetType: 'parking_space',
    targetId: updated.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function addParkingAssignmentForActor(
  actor: ActorContext,
  input: {
    parkingSpaceId: string;
    unitId?: string | null;
    residentId?: string | null;
    assignmentType: ParkingAssignmentType;
    startsAt?: string | null;
    notes?: string | null;
    reason?: string | null;
  },
): Promise<ParkingAssignment> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingAssignment.manage');
  const space = await requireParkingSpaceInTenant(input.parkingSpaceId, tenantId);
  await requireActorSiteAccess(actor, space.siteId);
  if (input.unitId) {
    const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
    if (unit.siteId !== space.siteId) throw new Error('戶別必須屬於同一案場');
  }
  if (input.residentId) {
    const resident = await requireResidentInTenant(input.residentId, tenantId);
    if (resident.siteId !== space.siteId) throw new Error('住戶必須屬於同一案場');
    if (input.unitId) {
      await requireCurrentOccupancy(
        tenantId,
        input.residentId,
        input.unitId,
        '住戶在此戶別沒有有效關係，不能指派此車位',
      );
    }
  }
  const exclusive = input.assignmentType !== 'common_use';
  if (exclusive && (space.spaceType === 'private' || space.spaceType === 'accessible')) {
    const current = await listParkingAssignments(tenantId, { parkingSpaceId: space.id, currentOnly: true });
    if (current.some((item) => item.assignmentType !== 'common_use')) {
      throw new Error('此私人車位目前已有有效指派，請先結束原關係');
    }
  }
  const assignment = await uniqueOrThrow(
    () =>
      insertParkingAssignment({
        tenantId,
        siteId: space.siteId,
        parkingSpaceId: space.id,
        unitId: input.unitId ?? null,
        residentId: input.residentId ?? null,
        assignmentType: input.assignmentType,
        startsAt: input.startsAt,
        notes: input.notes?.trim() || null,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      }),
    '此車位目前已有有效指派',
  );
  const site = await requireSiteInTenant(space.siteId, tenantId);
  const reason = input.reason?.trim();
  await writeAudit({
    actor,
    action: 'assignment.add',
    module: 'parkingAssignment',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」為車位「${space.displayName}」新增${PARKING_ASSIGNMENT_TYPE_LABELS[input.assignmentType]}關係${reason ? `，原因：${reason}` : ''}。`,
    targetType: 'parking_assignment',
    targetId: assignment.id,
    after: assignment,
    siteId: site.id,
  });
  return assignment;
}

export async function endParkingAssignmentForActor(
  actor: ActorContext,
  assignmentId: string,
  input?: { endsAt?: string; reason?: string | null },
): Promise<ParkingAssignment> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingAssignment.manage');
  const assignment = await requireParkingAssignmentInTenant(assignmentId, tenantId);
  await requireActorSiteAccess(actor, assignment.siteId);
  if (!assignment.isCurrent) throw new Error('此指派已結束');
  const endedAt = input?.endsAt ?? nowIso();
  const reason = input?.reason?.trim() || '結束車位指派';
  await endParkingAssignment(assignment.id, tenantId, endedAt);
  const next = await requireParkingAssignmentInTenant(assignment.id, tenantId);
  const site = await requireSiteInTenant(assignment.siteId, tenantId);
  const space = await requireParkingSpaceInTenant(assignment.parkingSpaceId, tenantId);
  await writeAudit({
    actor,
    action: 'assignment.end',
    module: 'parkingAssignment',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」結束車位「${space.displayName}」的${assignment.assignmentType}關係，原因：${reason}。`,
    targetType: 'parking_assignment',
    targetId: assignment.id,
    before: assignment,
    after: next,
    siteId: site.id,
  });
  return next;
}

export async function listParkingAssignmentsForActor(
  actor: ActorContext,
  parkingSpaceId: string,
): Promise<ParkingAssignment[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingAssignment.view');
  const space = await requireParkingSpaceInTenant(parkingSpaceId, tenantId);
  await requireActorSiteAccess(actor, space.siteId);
  return listParkingAssignments(tenantId, { parkingSpaceId: space.id });
}

export async function getParkingSettingsForActor(actor: ActorContext, siteId: string): Promise<SiteParkingSettings> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingSpace.view');
  await requireActorSiteAccess(actor, siteId);
  const existing = await getSiteParkingSettings(tenantId, siteId);
  if (existing) return existing;
  return {
    id: 'default',
    tenantId,
    siteId,
    visitorMaxDurationMinutes: DEFAULT_VISITOR_MAX_DURATION_MINUTES,
    temporaryMaxDurationMinutes: DEFAULT_VISITOR_MAX_DURATION_MINUTES,
    createdBy: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
    version: 1,
    syncStatus: 'local',
    deviceId: null,
  };
}

export async function updateParkingSettingsForActor(
  actor: ActorContext,
  siteId: string,
  input: { visitorMaxDurationMinutes: number; temporaryMaxDurationMinutes: number },
): Promise<SiteParkingSettings> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingSpace.manage');
  const site = await requireSiteInTenant(siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  if (input.visitorMaxDurationMinutes <= 0 || input.temporaryMaxDurationMinutes <= 0) {
    throw new Error('臨停上限必須大於 0 分鐘');
  }
  const settings = await upsertSiteParkingSettings({
    tenantId,
    siteId: site.id,
    visitorMaxDurationMinutes: input.visitorMaxDurationMinutes,
    temporaryMaxDurationMinutes: input.temporaryMaxDurationMinutes,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'update',
    module: 'parkingSpace',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新臨停上限為訪客 ${settings.visitorMaxDurationMinutes} 分鐘。`,
    targetType: 'site_parking_settings',
    targetId: settings.id,
    after: settings,
    siteId: site.id,
  });
  return settings;
}
