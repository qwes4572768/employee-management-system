import {
  PARCEL_KIND_LABELS,
  PARCEL_STATUS_LABELS,
  type ParcelKind,
  type ParcelStatus,
} from '@/constants/community';
import { getResidentById } from '@/repositories/residentRepository';
import {
  insertParcel,
  insertParcelEvent,
  listParcelEvents,
  listParcels,
  updateParcel,
} from '@/repositories/parcelRepository';
import type { Parcel, ParcelEvent } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireCommunitySiteRecord, requireCurrentOccupancy, requireParcelInTenant, requireSiteUnitInTenant } from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';

const WAITING_STATUSES: ParcelStatus[] = ['registered', 'notified'];

export async function registerParcel(
  actor: ActorContext,
  input: {
    unitId: string;
    residentId?: string | null;
    trackingNo?: string | null;
    courierName?: string | null;
    parcelKind?: ParcelKind;
    locationNote?: string | null;
    photoUri?: string | null;
    recipientName?: string | null;
    registeredAt?: string;
    deviceTime?: string;
  },
): Promise<Parcel> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.register');
  const unit = await requireSiteUnitInTenant(input.unitId, tenantId);
  await requireActorSiteAccess(actor, unit.siteId);
  let recipient = input.recipientName?.trim() || '';
  if (input.residentId) {
    const resident = await getResidentById(input.residentId, tenantId);
    if (!resident) throw new Error('找不到收件住戶');
    if (resident.siteId !== unit.siteId) throw new Error('收件住戶必須屬於同一案場');
    await requireCurrentOccupancy(
      tenantId,
      resident.id,
      unit.id,
      '收件住戶在此戶別沒有有效關係，不能掛到此戶包裹',
    );
    recipient = recipient || resident.fullName;
  }
  if (!recipient) throw new Error('請輸入收件人姓名');
  const deviceTime = input.deviceTime ?? nowIso();
  const registeredAt = input.registeredAt ?? deviceTime;
  const kind = input.parcelKind ?? 'general';
  const created = await insertParcel({
    tenantId,
    siteId: unit.siteId,
    unitId: unit.id,
    residentId: input.residentId ?? null,
    trackingNo: input.trackingNo?.trim() || null,
    courierName: input.courierName?.trim() || null,
    parcelKind: kind,
    locationNote: input.locationNote?.trim() || null,
    photoUri: input.photoUri ?? null,
    recipientNameSnapshot: recipient,
    unitLabelSnapshot: unit.displayName,
    registeredAt,
    deviceTime,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  await insertParcelEvent({
    tenantId,
    parcelId: created.id,
    action: 'register',
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    note: input.locationNote?.trim() || null,
    photoUri: input.photoUri ?? null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(unit.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'register',
    module: 'parcel',
    description: `${actor.fullName} 於 ${formatDateTimeZh(registeredAt)} 在「${site.name}」登記${PARCEL_KIND_LABELS[kind]}給「${unit.displayName}」${recipient}。`,
    targetType: 'parcel',
    targetId: created.id,
    targetDisplayName: `${unit.displayName}／${recipient}`,
    after: created,
    siteId: site.id,
  });
  return created;
}

export async function notifyParcel(actor: ActorContext, parcelId: string, note?: string | null): Promise<Parcel> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.register');
  const parcel = await requireCommunitySiteRecord(actor, await requireParcelInTenant(parcelId, tenantId));
  if (!WAITING_STATUSES.includes(parcel.status)) {
    throw new Error('此包裹目前不可標記已通知');
  }
  if (parcel.status === 'notified') return parcel;
  const at = nowIso();
  const updated = await updateParcel(parcel.id, tenantId, { status: 'notified', notifiedAt: at });
  await insertParcelEvent({
    tenantId,
    parcelId: parcel.id,
    action: 'notify',
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    note: note?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(parcel.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'notify',
    module: 'parcel',
    description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」將「${parcel.unitLabelSnapshot}」包裹標記為已通知。`,
    targetType: 'parcel',
    targetId: parcel.id,
    siteId: site.id,
  });
  return updated;
}

export async function pickupParcel(
  actor: ActorContext,
  parcelId: string,
  input: {
    pickupByName: string;
    pickupPhotoUri: string;
    pickupAt?: string;
    pickupSignatureNote?: string | null;
  },
): Promise<Parcel> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.pickup');
  const parcel = await requireCommunitySiteRecord(actor, await requireParcelInTenant(parcelId, tenantId));
  if (parcel.status === 'picked_up') throw new Error('此包裹已領取，不可重複領取');
  if (parcel.status === 'returned') throw new Error('此包裹已退件');
  if (parcel.status === 'cancelled') throw new Error('此包裹已取消');
  const nameError = required(input.pickupByName, '領取人姓名');
  if (nameError) throw new Error(nameError);
  if (!input.pickupPhotoUri?.trim()) {
    throw new Error('領取必須拍攝簽收照片');
  }
  const pickupAt = input.pickupAt ?? nowIso();
  const updated = await updateParcel(parcel.id, tenantId, {
    status: 'picked_up',
    pickupAt,
    pickupByName: input.pickupByName.trim(),
    pickupPhotoUri: input.pickupPhotoUri,
    pickupSignatureNote: input.pickupSignatureNote?.trim() || null,
    pickedUpByStaffId: actor.userId,
  });
  await insertParcelEvent({
    tenantId,
    parcelId: parcel.id,
    action: 'pickup',
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    note: `${input.pickupByName.trim()} 領取`,
    photoUri: input.pickupPhotoUri,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(parcel.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'pickup',
    module: 'parcel',
    description: `${actor.fullName} 於 ${formatDateTimeZh(pickupAt)} 在「${site.name}」完成「${parcel.unitLabelSnapshot}」包裹領取，領取人為「${input.pickupByName.trim()}」。`,
    targetType: 'parcel',
    targetId: parcel.id,
    targetDisplayName: parcel.recipientNameSnapshot,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function returnParcel(actor: ActorContext, parcelId: string, note?: string | null): Promise<Parcel> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.manage');
  const parcel = await requireCommunitySiteRecord(actor, await requireParcelInTenant(parcelId, tenantId));
  if (parcel.status === 'picked_up') throw new Error('已領取的包裹不可退件');
  if (parcel.status === 'returned') throw new Error('此包裹已退件');
  const updated = await updateParcel(parcel.id, tenantId, { status: 'returned' });
  await insertParcelEvent({
    tenantId,
    parcelId: parcel.id,
    action: 'return',
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    note: note?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(parcel.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'return',
    module: 'parcel',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」將「${parcel.unitLabelSnapshot}」包裹退件。`,
    targetType: 'parcel',
    targetId: parcel.id,
    siteId: site.id,
  });
  return updated;
}

export async function cancelParcel(actor: ActorContext, parcelId: string, note?: string | null): Promise<Parcel> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.manage');
  const parcel = await requireCommunitySiteRecord(actor, await requireParcelInTenant(parcelId, tenantId));
  if (parcel.status === 'picked_up') throw new Error('已領取的包裹不可取消');
  if (parcel.status === 'cancelled') throw new Error('此包裹已取消');
  const updated = await updateParcel(parcel.id, tenantId, { status: 'cancelled' });
  await insertParcelEvent({
    tenantId,
    parcelId: parcel.id,
    action: 'cancel',
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    note: note?.trim() || null,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(parcel.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'cancel',
    module: 'parcel',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」取消「${parcel.unitLabelSnapshot}」包裹。`,
    targetType: 'parcel',
    targetId: parcel.id,
    siteId: site.id,
  });
  return updated;
}

export async function listParcelsForActor(
  actor: ActorContext,
  input?: { siteId?: string | null; status?: ParcelStatus | null; unitId?: string | null },
): Promise<Parcel[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.view');
  if (input?.siteId) await requireActorSiteAccess(actor, input.siteId);
  const rows = await listParcels(tenantId, input);
  const visible: Parcel[] = [];
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

export async function getParcelForActor(
  actor: ActorContext,
  parcelId: string,
): Promise<{ parcel: Parcel; events: ParcelEvent[] }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.view');
  const parcel = await requireCommunitySiteRecord(actor, await requireParcelInTenant(parcelId, tenantId));
  return { parcel, events: await listParcelEvents(tenantId, parcel.id) };
}

export function parcelStatusLabel(status: ParcelStatus): string {
  return PARCEL_STATUS_LABELS[status];
}

export async function reverseParcelEvent(
  actor: ActorContext,
  parcelId: string,
  input: { reason: string; restoreStatus?: ParcelStatus },
): Promise<Parcel> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'parcel.manage');
  const reason = input.reason.trim();
  if (!reason) throw new Error('更正必須填寫原因');
  const parcel = await requireCommunitySiteRecord(actor, await requireParcelInTenant(parcelId, tenantId));
  const events = await listParcelEvents(tenantId, parcel.id);
  const lastMutating = [...events].reverse().find((item) => item.action === 'pickup' || item.action === 'return' || item.action === 'cancel' || item.action === 'notify');
  if (!lastMutating) throw new Error('沒有可更正的包裹事件');
  const restoreStatus =
    input.restoreStatus ??
    (parcel.status === 'picked_up' || parcel.status === 'returned' || parcel.status === 'cancelled'
      ? parcel.notifiedAt
        ? 'notified'
        : 'registered'
      : parcel.status);
  const patch: Parameters<typeof updateParcel>[2] = { status: restoreStatus };
  if (parcel.status === 'picked_up') {
    patch.pickupAt = null;
    patch.pickupByName = null;
    patch.pickupPhotoUri = null;
    patch.pickupSignatureNote = null;
    patch.pickedUpByStaffId = null;
  }
  const updated = await updateParcel(parcel.id, tenantId, patch);
  await insertParcelEvent({
    tenantId,
    parcelId: parcel.id,
    action: 'reversal',
    actorUserId: actor.userId,
    actorNameSnapshot: actor.fullName,
    note: `更正 ${lastMutating.action}`,
    correctsEventId: lastMutating.id,
    reason,
    createdBy: actor.userId,
    deviceId: actor.deviceId,
  });
  const site = await requireSiteInTenant(parcel.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'event.reverse',
    module: 'parcel',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更正戶別「${parcel.unitLabelSnapshot}」包裹「${parcel.recipientNameSnapshot}」狀態，原因：${reason}。`,
    targetType: 'parcel',
    targetId: parcel.id,
    targetDisplayName: parcel.recipientNameSnapshot,
    before: parcel,
    after: updated,
    siteId: site.id,
  });
  return updated;
}
