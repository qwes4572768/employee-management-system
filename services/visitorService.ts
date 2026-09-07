import {
  VISITOR_KIND_LABELS,
  VISITOR_PASS_STATUS_LABELS,
  type VisitorKind,
  type VisitorPassStatus,
} from '@/constants/community';
import { getResidentById } from '@/repositories/residentRepository';
import {
  insertVisitorMovement,
  insertVisitorPass,
  listVisitorMovements,
  listVisitorPasses,
  updateVisitorPass,
} from '@/repositories/visitorRepository';
import type { VisitorMovement, VisitorPass } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireCommunitySiteRecord, requireSiteUnitInTenant, requireVisitorPassInTenant } from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

async function expireIfNeeded(pass: VisitorPass, tenantId: string, at: Date): Promise<VisitorPass> {
  if (pass.status !== 'registered' || !pass.expiresAt) return pass;
  if (new Date(pass.expiresAt).getTime() >= at.getTime()) return pass;
  return updateVisitorPass(pass.id, tenantId, { status: 'expired' });
}

async function requirePassForSite(actor: ActorContext, passId: string): Promise<VisitorPass> {
  const tenantId = requireActorTenant(actor);
  const pass = await expireIfNeeded(await requireVisitorPassInTenant(passId, tenantId), tenantId, new Date());
  return requireCommunitySiteRecord(actor, pass);
}

export async function registerVisitorPass(
  actor: ActorContext,
  input: {
    siteId?: string | null;
    unitId: string;
    hostResidentId?: string | null;
    visitorKind: VisitorKind;
    visitorName: string;
    visitorPhone?: string | null;
    visitorCompany?: string | null;
    idLast4?: string | null;
    purpose?: string | null;
    expectedAt?: string | null;
    expiresAt?: string | null;
    deviceTime?: string;
  },
): Promise<VisitorPass> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'visitor.register');
  const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
  await requireActorSiteAccess(actor, unit.siteId);
  if (input.siteId && input.siteId !== unit.siteId) {
    throw new Error('戶別不屬於所選案場');
  }
  const nameError = required(input.visitorName, '訪客姓名');
  if (nameError) throw new Error(nameError);
  if (input.idLast4 && !/^\d{4}$/.test(input.idLast4.trim())) {
    throw new Error('身分證末四碼須為 4 位數字，系統不保存完整身分證號');
  }
  let hostName = unit.displayName;
  if (input.hostResidentId) {
    const host = await getResidentById(input.hostResidentId, tenantId);
    if (!host) throw new Error('找不到受訪住戶');
    if (host.siteId !== unit.siteId) throw new Error('受訪住戶必須屬於同一案場');
    hostName = host.fullName;
  }
  const deviceTime = input.deviceTime ?? nowIso();
  const site = await requireSiteInTenant(unit.siteId, tenantId);
  const created = await insertVisitorPass({
    tenantId,
    siteId: unit.siteId,
    unitId: unit.id,
    hostResidentId: input.hostResidentId ?? null,
    visitorKind: input.visitorKind,
    visitorName: input.visitorName.trim(),
    visitorPhone: input.visitorPhone?.trim() || null,
    visitorCompany: input.visitorCompany?.trim() || null,
    idLast4: input.idLast4?.trim() || null,
    purpose: input.purpose?.trim() || null,
    expectedAt: input.expectedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    hostNameSnapshot: hostName,
    unitLabelSnapshot: unit.displayName,
    deviceTime,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor,
    action: 'register',
    module: 'visitor',
    description: `${actor.fullName} 於 ${formatDateTimeZh(deviceTime)} 在「${site.name}」登記${VISITOR_KIND_LABELS[input.visitorKind]}「${created.visitorName}」，受訪戶為「${unit.displayName}」。`,
    targetType: 'visitor_pass',
    targetId: created.id,
    targetDisplayName: created.visitorName,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function checkInVisitor(
  actor: ActorContext,
  passId: string,
  input?: {
    occurredAt?: string;
    photoUri?: string | null;
    note?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<{ pass: VisitorPass; movement: VisitorMovement }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'visitor.check');
  const pass = await requirePassForSite(actor, passId);
  if (pass.status === 'expired') throw new Error('此訪客登記已過期');
  if (pass.status === 'cancelled') throw new Error('此訪客登記已取消');
  if (pass.status === 'checked_in') throw new Error('訪客已在場，不可重複進場');
  if (pass.status === 'checked_out') throw new Error('訪客已離場，請重新登記');
  if (pass.status !== 'registered') throw new Error('目前狀態不可進場');
  const occurredAt = input?.occurredAt ?? nowIso();
  const movement = await insertVisitorMovement({
    tenantId,
    siteId: pass.siteId,
    visitorPassId: pass.id,
    direction: 'in',
    occurredAt,
    processedBy: actor.userId,
    photoUri: input?.photoUri ?? null,
    note: input?.note ?? null,
    latitude: input?.latitude ?? null,
    longitude: input?.longitude ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const updated = await updateVisitorPass(pass.id, tenantId, {
    status: 'checked_in',
    checkedInAt: occurredAt,
  });
  const site = await requireSiteInTenant(pass.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'check_in',
    module: 'visitor',
    description: `${actor.fullName} 於 ${formatDateTimeZh(occurredAt)} 在「${site.name}」為${VISITOR_KIND_LABELS[pass.visitorKind]}「${pass.visitorName}」辦理進場。`,
    targetType: 'visitor_pass',
    targetId: pass.id,
    targetDisplayName: pass.visitorName,
    after: { pass: updated, movement },
    siteId: site.id,
  });
  return { pass: updated, movement };
}

export async function checkOutVisitor(
  actor: ActorContext,
  passId: string,
  input?: {
    occurredAt?: string;
    photoUri?: string | null;
    note?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<{ pass: VisitorPass; movement: VisitorMovement }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'visitor.check');
  const pass = await requirePassForSite(actor, passId);
  if (pass.status !== 'checked_in') {
    throw new Error('訪客尚未進場，不可離場');
  }
  const occurredAt = input?.occurredAt ?? nowIso();
  const movement = await insertVisitorMovement({
    tenantId,
    siteId: pass.siteId,
    visitorPassId: pass.id,
    direction: 'out',
    occurredAt,
    processedBy: actor.userId,
    photoUri: input?.photoUri ?? null,
    note: input?.note ?? null,
    latitude: input?.latitude ?? null,
    longitude: input?.longitude ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const updated = await updateVisitorPass(pass.id, tenantId, {
    status: 'checked_out',
    checkedOutAt: occurredAt,
  });
  const site = await requireSiteInTenant(pass.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'check_out',
    module: 'visitor',
    description: `${actor.fullName} 於 ${formatDateTimeZh(occurredAt)} 在「${site.name}」為${VISITOR_KIND_LABELS[pass.visitorKind]}「${pass.visitorName}」辦理離場。`,
    targetType: 'visitor_pass',
    targetId: pass.id,
    targetDisplayName: pass.visitorName,
    after: { pass: updated, movement },
    siteId: site.id,
  });
  return { pass: updated, movement };
}

export async function cancelVisitorPass(actor: ActorContext, passId: string, note?: string | null): Promise<VisitorPass> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'visitor.cancel');
  const pass = await requirePassForSite(actor, passId);
  if (pass.status === 'cancelled') throw new Error('此訪客登記已取消');
  if (pass.status === 'checked_in') throw new Error('訪客仍在場，請先辦理離場');
  const updated = await updateVisitorPass(pass.id, tenantId, { status: 'cancelled' });
  const site = await requireSiteInTenant(pass.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'cancel',
    module: 'visitor',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」取消${VISITOR_KIND_LABELS[pass.visitorKind]}「${pass.visitorName}」登記${note ? `：${note}` : ''}。`,
    targetType: 'visitor_pass',
    targetId: pass.id,
    targetDisplayName: pass.visitorName,
    before: pass,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function listVisitorPassesForActor(
  actor: ActorContext,
  input?: { siteId?: string | null; status?: VisitorPassStatus | null; unitId?: string | null },
): Promise<VisitorPass[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'visitor.view');
  if (input?.siteId) await requireActorSiteAccess(actor, input.siteId);
  const rows = await listVisitorPasses(tenantId, input);
  const visible: VisitorPass[] = [];
  for (const row of rows) {
    try {
      await requireActorSiteAccess(actor, row.siteId);
      visible.push(await expireIfNeeded(row, tenantId, new Date()));
    } catch {
      continue;
    }
  }
  return visible;
}

export async function getVisitorPassForActor(
  actor: ActorContext,
  passId: string,
): Promise<{ pass: VisitorPass; movements: VisitorMovement[] }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'visitor.view');
  const pass = await requirePassForSite(actor, passId);
  const movements = await listVisitorMovements(tenantId, pass.id);
  return { pass, movements };
}

export function visitorStatusLabel(status: VisitorPassStatus): string {
  return VISITOR_PASS_STATUS_LABELS[status];
}
