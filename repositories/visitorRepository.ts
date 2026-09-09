import { getDatabase } from '@/database/runtime';
import type { VisitorKind, VisitorPassStatus } from '@/constants/community';
import type { VisitorMovement, VisitorPass } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface PassRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  unit_id: string;
  host_resident_id: string | null;
  visitor_kind: VisitorKind;
  visitor_name: string;
  visitor_phone: string | null;
  visitor_company: string | null;
  id_last4: string | null;
  purpose: string | null;
  expected_at: string | null;
  expires_at: string | null;
  status: VisitorPassStatus;
  host_name_snapshot: string;
  unit_label_snapshot: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  time_source: 'device' | 'server';
  device_time: string;
  server_time: string | null;
}

interface MovementRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  visitor_pass_id: string;
  direction: 'in' | 'out';
  occurred_at: string;
  processed_by: string | null;
  photo_uri: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  event_kind: 'movement' | 'correction' | 'void';
  corrects_id: string | null;
  reason: string | null;
}

function mapPass(row: PassRow): VisitorPass {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    unitId: row.unit_id,
    hostResidentId: row.host_resident_id,
    visitorKind: row.visitor_kind,
    visitorName: row.visitor_name,
    visitorPhone: row.visitor_phone,
    visitorCompany: row.visitor_company,
    idLast4: row.id_last4,
    purpose: row.purpose,
    expectedAt: row.expected_at,
    expiresAt: row.expires_at,
    status: row.status,
    hostNameSnapshot: row.host_name_snapshot,
    unitLabelSnapshot: row.unit_label_snapshot,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    timeSource: row.time_source,
    deviceTime: row.device_time,
    serverTime: row.server_time,
    ...mapSync(row),
  };
}

function mapMovement(row: MovementRow): VisitorMovement {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    visitorPassId: row.visitor_pass_id,
    direction: row.direction,
    occurredAt: row.occurred_at,
    processedBy: row.processed_by,
    photoUri: row.photo_uri,
    note: row.note,
    latitude: row.latitude,
    longitude: row.longitude,
    eventKind: row.event_kind ?? 'movement',
    correctsId: row.corrects_id ?? null,
    reason: row.reason ?? null,
    ...mapSync(row),
  };
}

export async function insertVisitorPass(input: {
  tenantId: string;
  siteId: string;
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
  hostNameSnapshot: string;
  unitLabelSnapshot: string;
  deviceTime: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<VisitorPass> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO visitor_passes (
      id, tenant_id, site_id, unit_id, host_resident_id, visitor_kind, visitor_name, visitor_phone, visitor_company,
      id_last4, purpose, expected_at, expires_at, status, host_name_snapshot, unit_label_snapshot,
      checked_in_at, checked_out_at, time_source, device_time, server_time,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?, ?, NULL, NULL, 'device', ?, NULL, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.unitId,
      input.hostResidentId ?? null,
      input.visitorKind,
      input.visitorName,
      input.visitorPhone ?? null,
      input.visitorCompany ?? null,
      input.idLast4 ?? null,
      input.purpose ?? null,
      input.expectedAt ?? null,
      input.expiresAt ?? null,
      input.hostNameSnapshot,
      input.unitLabelSnapshot,
      input.deviceTime,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getVisitorPassById(id, input.tenantId);
  if (!created) throw new Error('登記訪客失敗');
  return created;
}

export async function getVisitorPassById(id: string, tenantId?: string | null): Promise<VisitorPass | null> {
  const row = tenantId
    ? await getDatabase().getFirst<PassRow>(
        'SELECT * FROM visitor_passes WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<PassRow>('SELECT * FROM visitor_passes WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapPass(row) : null;
}

export async function listVisitorPasses(
  tenantId: string,
  input?: { siteId?: string | null; status?: VisitorPassStatus | null; unitId?: string | null },
): Promise<VisitorPass[]> {
  const rows = await getDatabase().getAll<PassRow>(
    `SELECT * FROM visitor_passes WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapPass)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.status || item.status === input.status) &&
        (!input?.unitId || item.unitId === input.unitId),
    );
}

export async function updateVisitorPass(
  id: string,
  tenantId: string,
  patch: Partial<Pick<VisitorPass, 'status' | 'checkedInAt' | 'checkedOutAt'>>,
): Promise<VisitorPass> {
  const current = await getVisitorPassById(id, tenantId);
  if (!current) throw new Error('找不到訪客登記');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE visitor_passes SET status = ?, checked_in_at = ?, checked_out_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.status ?? current.status,
      patch.checkedInAt === undefined ? current.checkedInAt : patch.checkedInAt,
      patch.checkedOutAt === undefined ? current.checkedOutAt : patch.checkedOutAt,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getVisitorPassById(id, tenantId);
  if (!updated) throw new Error('更新訪客失敗');
  return updated;
}

export async function insertVisitorMovement(input: {
  tenantId: string;
  siteId: string;
  visitorPassId: string;
  direction: 'in' | 'out';
  occurredAt: string;
  processedBy: string | null;
  photoUri?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  eventKind?: 'movement' | 'correction' | 'void';
  correctsId?: string | null;
  reason?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<VisitorMovement> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO visitor_movements (
      id, tenant_id, site_id, visitor_pass_id, direction, occurred_at, processed_by, photo_uri, note, latitude, longitude,
      event_kind, corrects_id, reason,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.visitorPassId,
      input.direction,
      input.occurredAt,
      input.processedBy,
      input.photoUri ?? null,
      input.note ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.eventKind ?? 'movement',
      input.correctsId ?? null,
      input.reason ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<MovementRow>(
    'SELECT * FROM visitor_movements WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入進出紀錄失敗');
  return mapMovement(row);
}

export async function listVisitorMovements(tenantId: string, visitorPassId: string): Promise<VisitorMovement[]> {
  const rows = await getDatabase().getAll<MovementRow>(
    `SELECT * FROM visitor_movements WHERE tenant_id = ? AND visitor_pass_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, occurred_at ASC`,
    [tenantId, visitorPassId],
  );
  return rows.map(mapMovement);
}

export async function getVisitorMovementById(id: string, tenantId?: string | null): Promise<VisitorMovement | null> {
  const row = tenantId
    ? await getDatabase().getFirst<MovementRow>(
        'SELECT * FROM visitor_movements WHERE id = ? AND tenant_id = ?',
        [id, tenantId],
      )
    : await getDatabase().getFirst<MovementRow>('SELECT * FROM visitor_movements WHERE id = ?', [id]);
  return row ? mapMovement(row) : null;
}
