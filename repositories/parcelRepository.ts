import { getDatabase } from '@/database/runtime';
import type { ParcelKind, ParcelStatus } from '@/constants/community';
import type { Parcel, ParcelEvent } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface ParcelRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  unit_id: string;
  resident_id: string | null;
  tracking_no: string | null;
  courier_name: string | null;
  parcel_kind: ParcelKind;
  location_note: string | null;
  photo_uri: string | null;
  status: ParcelStatus;
  recipient_name_snapshot: string;
  unit_label_snapshot: string;
  registered_at: string;
  notified_at: string | null;
  pickup_at: string | null;
  pickup_by_name: string | null;
  pickup_photo_uri: string | null;
  pickup_signature_note: string | null;
  picked_up_by_staff_id: string | null;
  time_source: 'device' | 'server';
  device_time: string;
  server_time: string | null;
}

interface EventRow extends SyncRow {
  id: string;
  tenant_id: string;
  parcel_id: string;
  action: string;
  actor_user_id: string | null;
  actor_name_snapshot: string;
  note: string | null;
  photo_uri: string | null;
  corrects_event_id: string | null;
  reason: string | null;
}

function mapParcel(row: ParcelRow): Parcel {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    unitId: row.unit_id,
    residentId: row.resident_id,
    trackingNo: row.tracking_no,
    courierName: row.courier_name,
    parcelKind: row.parcel_kind,
    locationNote: row.location_note,
    photoUri: row.photo_uri,
    status: row.status,
    recipientNameSnapshot: row.recipient_name_snapshot,
    unitLabelSnapshot: row.unit_label_snapshot,
    registeredAt: row.registered_at,
    notifiedAt: row.notified_at,
    pickupAt: row.pickup_at,
    pickupByName: row.pickup_by_name,
    pickupPhotoUri: row.pickup_photo_uri,
    pickupSignatureNote: row.pickup_signature_note,
    pickedUpByStaffId: row.picked_up_by_staff_id,
    timeSource: row.time_source,
    deviceTime: row.device_time,
    serverTime: row.server_time,
    ...mapSync(row),
  };
}

function mapEvent(row: EventRow): ParcelEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    parcelId: row.parcel_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    actorNameSnapshot: row.actor_name_snapshot,
    note: row.note,
    photoUri: row.photo_uri,
    correctsEventId: row.corrects_event_id ?? null,
    reason: row.reason ?? null,
    ...mapSync(row),
  };
}

export async function insertParcel(input: {
  tenantId: string;
  siteId: string;
  unitId: string;
  residentId?: string | null;
  trackingNo?: string | null;
  courierName?: string | null;
  parcelKind?: ParcelKind;
  locationNote?: string | null;
  photoUri?: string | null;
  recipientNameSnapshot: string;
  unitLabelSnapshot: string;
  registeredAt: string;
  deviceTime: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<Parcel> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO parcels (
      id, tenant_id, site_id, unit_id, resident_id, tracking_no, courier_name, parcel_kind, location_note, photo_uri,
      status, recipient_name_snapshot, unit_label_snapshot, registered_at, notified_at, pickup_at, pickup_by_name,
      pickup_photo_uri, pickup_signature_note, picked_up_by_staff_id, time_source, device_time, server_time,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'device', ?, NULL, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.unitId,
      input.residentId ?? null,
      input.trackingNo ?? null,
      input.courierName ?? null,
      input.parcelKind ?? 'general',
      input.locationNote ?? null,
      input.photoUri ?? null,
      input.recipientNameSnapshot,
      input.unitLabelSnapshot,
      input.registeredAt,
      input.deviceTime,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getParcelById(id, input.tenantId);
  if (!created) throw new Error('登記包裹失敗');
  return created;
}

export async function getParcelById(id: string, tenantId?: string | null): Promise<Parcel | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ParcelRow>(
        'SELECT * FROM parcels WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<ParcelRow>('SELECT * FROM parcels WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapParcel(row) : null;
}

export async function listParcels(
  tenantId: string,
  input?: { siteId?: string | null; status?: ParcelStatus | null; unitId?: string | null },
): Promise<Parcel[]> {
  const rows = await getDatabase().getAll<ParcelRow>(
    `SELECT * FROM parcels WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY registered_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapParcel)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.status || item.status === input.status) &&
        (!input?.unitId || item.unitId === input.unitId),
    );
}

export async function updateParcel(
  id: string,
  tenantId: string,
  patch: Partial<
    Pick<
      Parcel,
      | 'status'
      | 'notifiedAt'
      | 'pickupAt'
      | 'pickupByName'
      | 'pickupPhotoUri'
      | 'pickupSignatureNote'
      | 'pickedUpByStaffId'
    >
  >,
): Promise<Parcel> {
  const current = await getParcelById(id, tenantId);
  if (!current) throw new Error('找不到包裹');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE parcels SET
      status = ?, notified_at = ?, pickup_at = ?, pickup_by_name = ?, pickup_photo_uri = ?,
      pickup_signature_note = ?, picked_up_by_staff_id = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.status ?? current.status,
      patch.notifiedAt === undefined ? current.notifiedAt : patch.notifiedAt,
      patch.pickupAt === undefined ? current.pickupAt : patch.pickupAt,
      patch.pickupByName === undefined ? current.pickupByName : patch.pickupByName,
      patch.pickupPhotoUri === undefined ? current.pickupPhotoUri : patch.pickupPhotoUri,
      patch.pickupSignatureNote === undefined ? current.pickupSignatureNote : patch.pickupSignatureNote,
      patch.pickedUpByStaffId === undefined ? current.pickedUpByStaffId : patch.pickedUpByStaffId,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getParcelById(id, tenantId);
  if (!updated) throw new Error('更新包裹失敗');
  return updated;
}

export async function insertParcelEvent(input: {
  tenantId: string;
  parcelId: string;
  action: string;
  actorUserId: string | null;
  actorNameSnapshot: string;
  note?: string | null;
  photoUri?: string | null;
  createdBy: string | null;
  deviceId: string | null;
  correctsEventId?: string | null;
  reason?: string | null;
}): Promise<ParcelEvent> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO parcel_events (
      id, tenant_id, parcel_id, action, actor_user_id, actor_name_snapshot, note, photo_uri, corrects_event_id, reason,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.parcelId,
      input.action,
      input.actorUserId,
      input.actorNameSnapshot,
      input.note ?? null,
      input.photoUri ?? null,
      input.correctsEventId ?? null,
      input.reason ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<EventRow>(
    'SELECT * FROM parcel_events WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入包裹事件失敗');
  return mapEvent(row);
}

export async function listParcelEvents(tenantId: string, parcelId: string): Promise<ParcelEvent[]> {
  const rows = await getDatabase().getAll<EventRow>(
    `SELECT * FROM parcel_events WHERE tenant_id = ? AND parcel_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
    [tenantId, parcelId],
  );
  return rows.map(mapEvent);
}
