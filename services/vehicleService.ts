import {
  DEFAULT_VISITOR_MAX_DURATION_MINUTES,
  VEHICLE_ACCESS_TYPE_LABELS,
  type ParkingOccupancySource,
  type ParkingViolationSeverity,
  type ParkingViolationStatus,
  type ParkingViolationType,
  type ResidentVehicleType,
  type VehicleAccessType,
} from '@/constants/mobility';
import { getDatabase } from '@/database/runtime';
import { insertNotification } from '@/repositories/notificationRepository';
import {
  getParkingOccupancyById,
  getSiteParkingSettings,
  insertParkingOccupancy,
  insertParkingViolation,
  listParkingAssignments,
  listParkingOccupancies,
  listParkingSpaces,
  listParkingViolations,
  updateParkingOccupancy,
  updateParkingViolation,
} from '@/repositories/parkingRepository';
import { listUsersByTenant } from '@/repositories/userRepository';
import { getVisitorPassById } from '@/repositories/visitorRepository';
import {
  getVehicleAccessPassById,
  getVehicleMovementById,
  insertResidentVehicle,
  insertVehicleAccessPass,
  insertVehicleMovement,
  listResidentVehicles,
  listVehicleAccessPasses,
  listVehicleMovements,
  updateResidentVehicle,
  updateVehicleAccessPass,
} from '@/repositories/vehicleRepository';
import type {
  ParkingOccupancy,
  ParkingViolation,
  ResidentVehicle,
  VehicleAccessPass,
  VehicleMovement,
} from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { normalizePlateNumber } from '@/utils/plate';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import {
  requireCommunitySiteRecord,
  requireCurrentOccupancy,
  requireParkingSpaceInTenant,
  requireParkingViolationInTenant,
  requireResidentInTenant,
  requireResidentVehicleInTenant,
  requireSiteUnitInTenant,
  requireVehicleAccessPassInTenant,
} from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { getEffectivePermissionKeys } from './permissionService';
import { getAuthorizedSites } from './siteService';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

function uniqueMessage(error: unknown, fallback: string): never {
  const text = error instanceof Error ? error.message : String(error);
  if (/UNIQUE/i.test(text)) throw new Error(fallback);
  throw error instanceof Error ? error : new Error(text);
}

async function notifySiteManagers(
  tenantId: string,
  siteId: string,
  permissionKeys: string[],
  title: string,
  body: string,
  kind: string,
  relatedId: string,
): Promise<void> {
  const users = await listUsersByTenant(tenantId);
  for (const user of users) {
    const keys = await getEffectivePermissionKeys(user);
    if (!permissionKeys.some((key) => keys.includes(key))) continue;
    const sites = await getAuthorizedSites(user);
    if (!sites.some((site) => site.id === siteId)) continue;
    await insertNotification({ tenantId, userId: user.id, title, body, kind, relatedId });
  }
}

function voidedMovementIds(movements: VehicleMovement[]): Set<string> {
  return new Set(movements.filter((item) => item.eventKind === 'void' && item.correctsId).map((item) => item.correctsId as string));
}

export function lastEffectiveVehicleMovement(movements: VehicleMovement[]): VehicleMovement | null {
  const voided = voidedMovementIds(movements);
  const effective = movements.filter((item) => item.eventKind === 'movement' && !voided.has(item.id));
  return effective[effective.length - 1] ?? null;
}

async function movementsForPlate(tenantId: string, siteId: string, plateNoNormalized: string): Promise<VehicleMovement[]> {
  return listVehicleMovements(tenantId, { siteId, plateNoNormalized });
}

export async function createResidentVehicleForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    residentId?: string | null;
    unitId?: string | null;
    plateNo: string;
    vehicleType: ResidentVehicleType;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    isPrimary?: boolean;
    allowDuplicate?: boolean;
    notes?: string | null;
  },
): Promise<ResidentVehicle> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicle.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const plateError = required(input.plateNo, '車牌');
  if (plateError) throw new Error(plateError);
  const normalized = normalizePlateNumber(input.plateNo);
  if (!normalized) throw new Error('車牌不能為空');
  if (input.allowDuplicate && !input.notes?.trim()) {
    throw new Error('共用車牌必須填寫原因，不可默默重複');
  }
  if (input.residentId && input.unitId) {
    await requireResidentInTenant(input.residentId, tenantId);
    await requireSiteUnitInTenant(input.unitId, tenantId);
    await requireCurrentOccupancy(
      tenantId,
      input.residentId,
      input.unitId,
      '住戶在此戶別沒有有效關係，不能掛到此戶車輛',
    );
  } else if (input.residentId) {
    const resident = await requireResidentInTenant(input.residentId, tenantId);
    if (resident.siteId !== site.id) throw new Error('住戶必須屬於同一案場');
  } else if (input.unitId) {
    const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
    if (unit.siteId !== site.id) throw new Error('戶別必須屬於同一案場');
  }
  try {
    const vehicle = await insertResidentVehicle({
      tenantId,
      siteId: site.id,
      residentId: input.residentId ?? null,
      unitId: input.unitId ?? null,
      plateNo: input.plateNo.trim(),
      plateNoNormalized: normalized,
      vehicleType: input.vehicleType,
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      color: input.color?.trim() || null,
      isPrimary: input.isPrimary,
      allowDuplicate: input.allowDuplicate,
      notes: input.notes?.trim() || null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    await writeAudit({
      actor,
      action: 'create',
      module: 'vehicle',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」登錄車輛「${vehicle.plateNo}」。`,
      targetType: 'resident_vehicle',
      targetId: vehicle.id,
      targetDisplayName: vehicle.plateNo,
      after: vehicle,
      siteId: site.id,
    });
    return vehicle;
  } catch (error) {
    uniqueMessage(error, '同一案場已有相同車牌的使用中車輛');
  }
}

export async function listResidentVehiclesForActor(actor: ActorContext, siteId?: string | null): Promise<ResidentVehicle[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicle.view');
  if (siteId) await requireActorSiteAccess(actor, siteId);
  const rows = await listResidentVehicles(tenantId, { siteId });
  const visible: ResidentVehicle[] = [];
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

export async function getResidentVehicleForActor(actor: ActorContext, id: string): Promise<ResidentVehicle> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicle.view');
  return requireCommunitySiteRecord(actor, await requireResidentVehicleInTenant(id, tenantId));
}

export async function updateResidentVehicleForActor(
  actor: ActorContext,
  id: string,
  patch: Partial<Pick<ResidentVehicle, 'plateNo' | 'vehicleType' | 'brand' | 'model' | 'color' | 'status' | 'notes'>>,
): Promise<ResidentVehicle> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicle.manage');
  const current = await requireResidentVehicleInTenant(id, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const next = {
    ...patch,
    plateNoNormalized: patch.plateNo ? normalizePlateNumber(patch.plateNo) : current.plateNoNormalized,
  };
  const updated = await updateResidentVehicle(id, tenantId, next);
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'vehicle',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新車輛「${updated.plateNo}」。`,
    targetType: 'resident_vehicle',
    targetId: updated.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function createVehicleAccessPassForActor(
  actor: ActorContext,
  input: {
    siteId?: string | null;
    vehicleId?: string | null;
    unitId?: string | null;
    visitorPassId?: string | null;
    plateNo?: string | null;
    accessType: VehicleAccessType;
    validFrom?: string | null;
    validUntil?: string | null;
    notes?: string | null;
  },
): Promise<VehicleAccessPass> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.register');
  let plate = input.plateNo?.trim() || '';
  let siteId = input.siteId ?? null;
  let vehicleId = input.vehicleId ?? null;
  let unitId = input.unitId ?? null;
  if (input.vehicleId) {
    const vehicle = await requireResidentVehicleInTenant(input.vehicleId, tenantId);
    await requireActorSiteAccess(actor, vehicle.siteId);
    plate = plate || vehicle.plateNo;
    siteId = siteId ?? vehicle.siteId;
    unitId = unitId ?? vehicle.unitId;
  }
  if (input.visitorPassId) {
    const pass = await getVisitorPassById(input.visitorPassId, tenantId);
    if (!pass) throw new Error('找不到訪客登記');
    await requireActorSiteAccess(actor, pass.siteId);
    siteId = siteId ?? pass.siteId;
    unitId = unitId ?? pass.unitId;
  }
  if (!siteId) throw new Error('請選擇案場');
  const site = await requireSiteInTenant(siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const plateError = required(plate, '車牌');
  if (plateError) throw new Error(plateError);
  const created = await insertVehicleAccessPass({
    tenantId,
    siteId: site.id,
    vehicleId,
    unitId,
    visitorPassId: input.visitorPassId ?? null,
    plateNoSnapshot: plate,
    plateNoNormalized: normalizePlateNumber(plate),
    accessType: input.accessType,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    notes: input.notes?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'register',
    module: 'vehicleAccess',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」登記${VEHICLE_ACCESS_TYPE_LABELS[input.accessType]}「${created.plateNoSnapshot}」。`,
    targetType: 'vehicle_access_pass',
    targetId: created.id,
    targetDisplayName: created.plateNoSnapshot,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function listVehicleAccessPassesForActor(actor: ActorContext, siteId?: string | null): Promise<VehicleAccessPass[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.view');
  if (siteId) await requireActorSiteAccess(actor, siteId);
  const rows = await listVehicleAccessPasses(tenantId, { siteId });
  const visible: VehicleAccessPass[] = [];
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

export async function cancelVehicleAccessPassForActor(actor: ActorContext, id: string, reason?: string | null): Promise<VehicleAccessPass> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.register');
  const current = await requireVehicleAccessPassInTenant(id, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const updated = await updateVehicleAccessPass(id, tenantId, { status: 'cancelled', notes: reason ?? current.notes });
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'cancel',
    module: 'vehicleAccess',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」取消車輛通行證「${current.plateNoSnapshot}」${reason ? `，原因：${reason}` : ''}。`,
    targetType: 'vehicle_access_pass',
    targetId: current.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

async function resolveInside(
  tenantId: string,
  siteId: string,
  plateNoNormalized: string,
): Promise<boolean> {
  const last = lastEffectiveVehicleMovement(await movementsForPlate(tenantId, siteId, plateNoNormalized));
  return last?.direction === 'in';
}

async function maybeUnauthorizedViolation(
  actor: ActorContext,
  tenantId: string,
  spaceId: string,
  occupancy: ParkingOccupancy,
  vehicle: ResidentVehicle | null,
  accessPass: VehicleAccessPass | null,
): Promise<ParkingViolation | null> {
  const space = await requireParkingSpaceInTenant(spaceId, tenantId);
  if (space.spaceType !== 'private' && space.spaceType !== 'accessible') return null;
  const assignments = await listParkingAssignments(tenantId, { parkingSpaceId: space.id, currentOnly: true });
  const exclusive = assignments.filter((item) => item.assignmentType !== 'common_use');
  if (exclusive.length === 0) return null;
  const unitId = vehicle?.unitId ?? accessPass?.unitId ?? null;
  const residentId = vehicle?.residentId ?? null;
  const authorized = exclusive.some(
    (item) =>
      (item.unitId && unitId && item.unitId === unitId) ||
      (item.residentId && residentId && item.residentId === residentId),
  );
  if (authorized) return null;
  const violation = await insertParkingViolation({
    tenantId,
    siteId: space.siteId,
    parkingSpaceId: space.id,
    vehicleId: vehicle?.id ?? null,
    occupancyId: occupancy.id,
    plateNoSnapshot: occupancy.plateNoSnapshot,
    violationType: 'unauthorized_space',
    severity: 'important',
    description: `陌生車 ${occupancy.plateNoSnapshot} 占用私人車位 ${space.displayName}`,
    reportedBy: actor.userId,
    reportedAt: nowIso(),
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await updateParkingOccupancy(occupancy.id, tenantId, { status: 'violation' });
  const site = await requireSiteInTenant(space.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'create',
    module: 'parkingViolation',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」登記占用異常：陌生車「${occupancy.plateNoSnapshot}」占用「${space.displayName}」。`,
    targetType: 'parking_violation',
    targetId: violation.id,
    after: violation,
    siteId: site.id,
  });
  return violation;
}

export async function checkInVehicleForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    accessPassId?: string | null;
    vehicleId?: string | null;
    plateNo?: string | null;
    parkingSpaceId?: string | null;
    gateName?: string | null;
    photoUri?: string | null;
    note?: string | null;
    occurredAt?: string;
    source?: ParkingOccupancySource;
  },
): Promise<{ movement: VehicleMovement; occupancy: ParkingOccupancy | null; violation: ParkingViolation | null }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.check');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  let vehicle: ResidentVehicle | null = null;
  let pass: VehicleAccessPass | null = null;
  let plate = input.plateNo?.trim() || '';
  if (input.vehicleId) {
    vehicle = await requireResidentVehicleInTenant(input.vehicleId, tenantId);
    plate = plate || vehicle.plateNo;
  }
  if (input.accessPassId) {
    pass = await requireVehicleAccessPassInTenant(input.accessPassId, tenantId);
    if (pass.status === 'cancelled') throw new Error('此通行證已取消');
    plate = plate || pass.plateNoSnapshot;
    if (!vehicle && pass.vehicleId) vehicle = await requireResidentVehicleInTenant(pass.vehicleId, tenantId).catch(() => null);
  }
  const plateError = required(plate, '車牌');
  if (plateError) throw new Error(plateError);
  const normalized = normalizePlateNumber(plate);
  if (await resolveInside(tenantId, site.id, normalized)) {
    throw new Error('此車輛目前已在場內');
  }
  const occurredAt = input.occurredAt ?? nowIso();
  return getDatabase().withTransaction(async () => {
    if (await resolveInside(tenantId, site.id, normalized)) {
      throw new Error('此車輛目前已在場內');
    }
    const movement = await insertVehicleMovement({
      tenantId,
      siteId: site.id,
      vehicleId: vehicle?.id ?? null,
      accessPassId: pass?.id ?? null,
      plateNoSnapshot: plate,
      plateNoNormalized: normalized,
      direction: 'in',
      gateName: input.gateName,
      occurredAt,
      processedBy: actor.userId,
      photoUri: input.photoUri,
      note: input.note,
      deviceTime: occurredAt,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    let occupancy: ParkingOccupancy | null = null;
    let violation: ParkingViolation | null = null;
    if (input.parkingSpaceId) {
      const space = await requireParkingSpaceInTenant(input.parkingSpaceId, tenantId);
      if (space.siteId !== site.id) throw new Error('車位必須屬於同一案場');
      const openSpace = await listParkingOccupancies(tenantId, { parkingSpaceId: space.id, openOnly: true });
      if (openSpace.length > 0) throw new Error('此車位目前已有占用，請先解除');
      occupancy = await insertParkingOccupancy({
        tenantId,
        siteId: site.id,
        parkingSpaceId: space.id,
        vehicleId: vehicle?.id ?? null,
        accessPassId: pass?.id ?? null,
        plateNoSnapshot: plate,
        occupiedFrom: occurredAt,
        source: input.source ?? 'guard',
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      });
      violation = await maybeUnauthorizedViolation(actor, tenantId, space.id, occupancy, vehicle, pass);
    }
    await writeAudit({
      actor,
      action: 'check_in',
      module: 'vehicleAccess',
      description: `${actor.fullName} 於 ${formatDateTimeZh(occurredAt)} 在「${site.name}」辦理車輛「${plate}」進場。`,
      targetType: 'vehicle_movement',
      targetId: movement.id,
      targetDisplayName: plate,
      after: { movement, occupancy },
      siteId: site.id,
    });
    return { movement, occupancy, violation };
  });
}

export async function checkOutVehicleForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    accessPassId?: string | null;
    vehicleId?: string | null;
    plateNo?: string | null;
    occurredAt?: string;
    note?: string | null;
  },
): Promise<{ movement: VehicleMovement }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.check');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  let plate = input.plateNo?.trim() || '';
  let vehicleId = input.vehicleId ?? null;
  let accessPassId = input.accessPassId ?? null;
  if (input.vehicleId) {
    const vehicle = await requireResidentVehicleInTenant(input.vehicleId, tenantId);
    plate = plate || vehicle.plateNo;
  }
  if (input.accessPassId) {
    const pass = await requireVehicleAccessPassInTenant(input.accessPassId, tenantId);
    plate = plate || pass.plateNoSnapshot;
  }
  const plateError = required(plate, '車牌');
  if (plateError) throw new Error(plateError);
  const normalized = normalizePlateNumber(plate);
  if (!(await resolveInside(tenantId, site.id, normalized))) {
    throw new Error('查無有效進場紀錄');
  }
  const occurredAt = input.occurredAt ?? nowIso();
  return getDatabase().withTransaction(async () => {
    if (!(await resolveInside(tenantId, site.id, normalized))) {
      throw new Error('查無有效進場紀錄');
    }
    const movement = await insertVehicleMovement({
      tenantId,
      siteId: site.id,
      vehicleId,
      accessPassId,
      plateNoSnapshot: plate,
      plateNoNormalized: normalized,
      direction: 'out',
      occurredAt,
      processedBy: actor.userId,
      note: input.note,
      deviceTime: occurredAt,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const open = (await listParkingOccupancies(tenantId, { siteId: site.id, openOnly: true })).filter(
      (item) => normalizePlateNumber(item.plateNoSnapshot) === normalized,
    );
    for (const occupancy of open) {
      await updateParkingOccupancy(occupancy.id, tenantId, { occupiedUntil: occurredAt, status: 'released' });
    }
    await writeAudit({
      actor,
      action: 'check_out',
      module: 'vehicleAccess',
      description: `${actor.fullName} 於 ${formatDateTimeZh(occurredAt)} 在「${site.name}」辦理車輛「${plate}」離場。`,
      targetType: 'vehicle_movement',
      targetId: movement.id,
      targetDisplayName: plate,
      after: movement,
      siteId: site.id,
    });
    return { movement };
  });
}

export async function occupyParkingSpaceForActor(
  actor: ActorContext,
  input: {
    parkingSpaceId: string;
    plateNo: string;
    vehicleId?: string | null;
    accessPassId?: string | null;
    source?: ParkingOccupancySource;
    photoUri?: string | null;
  },
): Promise<{ occupancy: ParkingOccupancy; violation: ParkingViolation | null }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingOccupancy.manage');
  const space = await requireParkingSpaceInTenant(input.parkingSpaceId, tenantId);
  await requireActorSiteAccess(actor, space.siteId);
  const plateError = required(input.plateNo, '車牌');
  if (plateError) throw new Error(plateError);
  const vehicle = input.vehicleId ? await requireResidentVehicleInTenant(input.vehicleId, tenantId) : null;
  const pass = input.accessPassId ? await requireVehicleAccessPassInTenant(input.accessPassId, tenantId) : null;
  return getDatabase().withTransaction(async () => {
    const open = await listParkingOccupancies(tenantId, { parkingSpaceId: space.id, openOnly: true });
    if (open.length > 0) throw new Error('此車位目前已有占用，請先解除');
    const occupancy = await insertParkingOccupancy({
      tenantId,
      siteId: space.siteId,
      parkingSpaceId: space.id,
      vehicleId: vehicle?.id ?? null,
      accessPassId: pass?.id ?? null,
      plateNoSnapshot: input.plateNo.trim(),
      occupiedFrom: nowIso(),
      source: input.source ?? 'manual',
      captureImageUri: input.photoUri ?? null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const violation = await maybeUnauthorizedViolation(actor, tenantId, space.id, occupancy, vehicle, pass);
    const site = await requireSiteInTenant(space.siteId, tenantId);
    await writeAudit({
      actor,
      action: 'occupy',
      module: 'parkingOccupancy',
      description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」登記車位「${space.displayName}」由「${occupancy.plateNoSnapshot}」占用。`,
      targetType: 'parking_occupancy',
      targetId: occupancy.id,
      after: occupancy,
      siteId: site.id,
    });
    return { occupancy, violation };
  });
}

export async function releaseParkingOccupancyForActor(actor: ActorContext, occupancyId: string): Promise<ParkingOccupancy> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingOccupancy.manage');
  const current = await getParkingOccupancyById(occupancyId, tenantId);
  if (!current) throw new Error('找不到占用紀錄');
  await requireActorSiteAccess(actor, current.siteId);
  const updated = await updateParkingOccupancy(occupancyId, tenantId, { occupiedUntil: nowIso(), status: 'released' });
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'release',
    module: 'parkingOccupancy',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」解除「${current.plateNoSnapshot}」占用。`,
    targetType: 'parking_occupancy',
    targetId: current.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function refreshParkingOverstaysForSite(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<ParkingOccupancy[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorSiteAccess(actor, siteId);
  const settings = await getSiteParkingSettings(tenantId, siteId);
  const visitorMax = settings?.visitorMaxDurationMinutes ?? DEFAULT_VISITOR_MAX_DURATION_MINUTES;
  const tempMax = settings?.temporaryMaxDurationMinutes ?? DEFAULT_VISITOR_MAX_DURATION_MINUTES;
  const spaceRows = await listParkingSpaces(tenantId, { siteId });
  const spaceById = new Map(spaceRows.map((item) => [item.id, item]));
  const open = await listParkingOccupancies(tenantId, { siteId, openOnly: true });
  const marked: ParkingOccupancy[] = [];
  for (const occupancy of open) {
    if (occupancy.status === 'overstayed' || occupancy.status === 'violation') continue;
    const space = spaceById.get(occupancy.parkingSpaceId);
    if (!space || (space.spaceType !== 'visitor' && space.spaceType !== 'temporary')) continue;
    const max = space.spaceType === 'visitor' ? visitorMax : tempMax;
    const minutes = Math.floor((at.getTime() - new Date(occupancy.occupiedFrom).getTime()) / 60000);
    if (minutes <= max) continue;
    const updated = await updateParkingOccupancy(occupancy.id, tenantId, { status: 'overstayed' });
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    const site = await requireSiteInTenant(siteId, tenantId);
    await notifySiteManagers(
      tenantId,
      siteId,
      ['mobilityDashboard.view', 'parkingViolation.view', 'parkingOccupancy.manage'],
      '臨停逾時',
      `訪客車輛 ${occupancy.plateNoSnapshot} 已臨停 ${hours}小時${remain}分`,
      'parking_overstay',
      occupancy.id,
    );
    const existing = (await listParkingViolations(tenantId, { siteId, status: 'open' })).find(
      (item) => item.occupancyId === occupancy.id && item.violationType === 'visitor_overstay',
    );
    if (!existing) {
      const violation = await insertParkingViolation({
        tenantId,
        siteId,
        parkingSpaceId: occupancy.parkingSpaceId,
        vehicleId: occupancy.vehicleId,
        occupancyId: occupancy.id,
        plateNoSnapshot: occupancy.plateNoSnapshot,
        violationType: 'visitor_overstay',
        description: `訪客車輛 ${occupancy.plateNoSnapshot} 已臨停 ${hours}小時${remain}分`,
        reportedBy: actor.userId,
        reportedAt: at.toISOString(),
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      });
      await writeAudit({
        actor,
        action: 'overstay',
        module: 'parkingOccupancy',
        description: `${actor.fullName} 於 ${formatDateTimeZh(at.toISOString())} 在「${site.name}」標記臨停逾時「${occupancy.plateNoSnapshot}」。`,
        targetType: 'parking_violation',
        targetId: violation.id,
        siteId,
      });
    }
    marked.push(updated);
  }
  return marked;
}

export async function createParkingViolationForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    parkingSpaceId?: string | null;
    vehicleId?: string | null;
    plateNo: string;
    violationType: ParkingViolationType;
    severity?: ParkingViolationSeverity;
    description?: string | null;
    photoUri?: string | null;
  },
): Promise<ParkingViolation> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingViolation.create');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const plateError = required(input.plateNo, '車牌');
  if (plateError) throw new Error(plateError);
  const violation = await insertParkingViolation({
    tenantId,
    siteId: site.id,
    parkingSpaceId: input.parkingSpaceId ?? null,
    vehicleId: input.vehicleId ?? null,
    plateNoSnapshot: input.plateNo.trim(),
    violationType: input.violationType,
    severity: input.severity,
    description: input.description?.trim() || null,
    reportedBy: actor.userId,
    reportedAt: nowIso(),
    photoUri: input.photoUri,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'parkingViolation',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」登記占用異常「${violation.plateNoSnapshot}」。`,
    targetType: 'parking_violation',
    targetId: violation.id,
    after: violation,
    siteId: site.id,
  });
  return violation;
}

export async function resolveParkingViolationForActor(
  actor: ActorContext,
  id: string,
  input: { status: Extract<ParkingViolationStatus, 'resolved' | 'voided' | 'processing'>; resolutionNote?: string | null },
): Promise<ParkingViolation> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingViolation.manage');
  const current = await requireParkingViolationInTenant(id, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const updated = await updateParkingViolation(id, tenantId, {
    status: input.status,
    resolvedBy: actor.userId,
    resolvedAt: input.status === 'processing' ? null : nowIso(),
    resolutionNote: input.resolutionNote ?? current.resolutionNote,
  });
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'resolve',
    module: 'parkingViolation',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」將占用異常「${current.plateNoSnapshot}」標記為${input.status}${input.resolutionNote ? `，原因：${input.resolutionNote}` : ''}。`,
    targetType: 'parking_violation',
    targetId: current.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function listParkingViolationsForActor(actor: ActorContext, siteId?: string | null): Promise<ParkingViolation[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingViolation.view');
  if (siteId) await requireActorSiteAccess(actor, siteId);
  const rows = await listParkingViolations(tenantId, { siteId });
  const visible: ParkingViolation[] = [];
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

export async function listParkingOccupanciesForActor(actor: ActorContext, siteId?: string | null, openOnly = false): Promise<ParkingOccupancy[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingOccupancy.view');
  if (siteId) await requireActorSiteAccess(actor, siteId);
  const rows = await listParkingOccupancies(tenantId, { siteId, openOnly });
  const visible: ParkingOccupancy[] = [];
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

export async function listVehicleMovementsForActor(
  actor: ActorContext,
  input: { siteId: string; plateNo?: string | null; accessPassId?: string | null },
): Promise<VehicleMovement[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.view');
  await requireActorSiteAccess(actor, input.siteId);
  return listVehicleMovements(tenantId, {
    siteId: input.siteId,
    plateNoNormalized: input.plateNo ? normalizePlateNumber(input.plateNo) : null,
    accessPassId: input.accessPassId,
  });
}

export async function correctVehicleMovementForActor(
  actor: ActorContext,
  movementId: string,
  input: { occurredAt: string; reason: string },
): Promise<VehicleMovement> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingOccupancy.manage');
  const reason = input.reason.trim();
  if (!reason) throw new Error('更正必須填寫原因');
  const original = await getVehicleMovementById(movementId, tenantId);
  if (!original) {
    const other = await getVehicleMovementById(movementId);
    if (other) throw new Error('無權存取其他公司的資料');
    throw new Error('找不到進出紀錄');
  }
  await requireActorSiteAccess(actor, original.siteId);
  if (original.eventKind !== 'movement') throw new Error('只能更正原始進出紀錄');
  const movement = await insertVehicleMovement({
    tenantId,
    siteId: original.siteId,
    vehicleId: original.vehicleId,
    accessPassId: original.accessPassId,
    plateNoSnapshot: original.plateNoSnapshot,
    plateNoNormalized: original.plateNoNormalized,
    direction: original.direction,
    occurredAt: input.occurredAt,
    processedBy: actor.userId,
    deviceTime: nowIso(),
    eventKind: 'correction',
    correctsId: original.id,
    reason,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(original.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'movement.correct',
    module: 'vehicleAccess',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更正車輛「${original.plateNoSnapshot}」進出時間，原因：${reason}。`,
    targetType: 'vehicle_movement',
    targetId: original.id,
    after: { original, movement },
    siteId: site.id,
  });
  return movement;
}

export async function voidVehicleMovementForActor(actor: ActorContext, movementId: string, reason: string): Promise<VehicleMovement> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingOccupancy.manage');
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('作廢必須填寫原因');
  const original = await getVehicleMovementById(movementId, tenantId);
  if (!original) throw new Error('找不到進出紀錄');
  await requireActorSiteAccess(actor, original.siteId);
  const movement = await insertVehicleMovement({
    tenantId,
    siteId: original.siteId,
    vehicleId: original.vehicleId,
    accessPassId: original.accessPassId,
    plateNoSnapshot: original.plateNoSnapshot,
    plateNoNormalized: original.plateNoNormalized,
    direction: original.direction,
    occurredAt: nowIso(),
    processedBy: actor.userId,
    deviceTime: nowIso(),
    eventKind: 'void',
    correctsId: original.id,
    reason: trimmed,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(original.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'movement.void',
    module: 'vehicleAccess',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」作廢車輛「${original.plateNoSnapshot}」進出紀錄，原因：${trimmed}。`,
    targetType: 'vehicle_movement',
    targetId: original.id,
    after: { original, movement },
    siteId: site.id,
  });
  return movement;
}

export async function reverseVehicleMovementForActor(
  actor: ActorContext,
  movementId: string,
  reason: string,
): Promise<VehicleMovement> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parkingOccupancy.manage');
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('沖正必須填寫原因');
  const original = await getVehicleMovementById(movementId, tenantId);
  if (!original) throw new Error('找不到進出紀錄');
  await requireActorSiteAccess(actor, original.siteId);
  const movement = await insertVehicleMovement({
    tenantId,
    siteId: original.siteId,
    vehicleId: original.vehicleId,
    accessPassId: original.accessPassId,
    plateNoSnapshot: original.plateNoSnapshot,
    plateNoNormalized: original.plateNoNormalized,
    direction: original.direction === 'in' ? 'out' : 'in',
    occurredAt: nowIso(),
    processedBy: actor.userId,
    deviceTime: nowIso(),
    eventKind: 'reversal',
    correctsId: original.id,
    reason: trimmed,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(original.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'movement.reverse',
    module: 'vehicleAccess',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」沖正車輛「${original.plateNoSnapshot}」進出紀錄，原因：${trimmed}。`,
    targetType: 'vehicle_movement',
    targetId: original.id,
    after: { original, movement },
    siteId: site.id,
  });
  return movement;
}

export interface OnSiteVehicleView {
  plateNo: string;
  plateNoNormalized: string;
  lastInAt: string;
  accessType: VehicleAccessType | null;
  visitorName: string | null;
  unitLabel: string | null;
  stillOnSite: boolean;
  accessPassId: string | null;
  vehicleId: string | null;
}

export async function listOnSiteVehiclesForActor(actor: ActorContext, siteId: string): Promise<OnSiteVehicleView[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'vehicleAccess.view');
  await requireActorSiteAccess(actor, siteId);
  const movements = await listVehicleMovements(tenantId, { siteId });
  const byPlate = new Map<string, VehicleMovement[]>();
  for (const movement of movements) {
    const list = byPlate.get(movement.plateNoNormalized) ?? [];
    list.push(movement);
    byPlate.set(movement.plateNoNormalized, list);
  }
  const views: OnSiteVehicleView[] = [];
  for (const list of byPlate.values()) {
    const last = lastEffectiveVehicleMovement(list);
    if (last?.direction !== 'in') continue;
    const pass = last.accessPassId ? await getVehicleAccessPassById(last.accessPassId, tenantId) : null;
    const visitor = pass?.visitorPassId ? await getVisitorPassById(pass.visitorPassId, tenantId) : null;
    views.push({
      plateNo: last.plateNoSnapshot,
      plateNoNormalized: last.plateNoNormalized,
      lastInAt: last.occurredAt,
      accessType: pass?.accessType ?? null,
      visitorName: visitor?.visitorName ?? null,
      unitLabel: visitor?.unitLabelSnapshot ?? null,
      stillOnSite: true,
      accessPassId: last.accessPassId,
      vehicleId: last.vehicleId,
    });
  }
  return views.sort((a, b) => b.lastInAt.localeCompare(a.lastInAt));
}

export { normalizePlateNumber };
