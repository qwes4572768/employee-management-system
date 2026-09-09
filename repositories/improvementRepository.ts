import { getDatabase } from '@/database/runtime';
import type { ImprovementStatus } from '@/constants/inspection';
import type { ImprovementFollowup, ImprovementOrder } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface OrderRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  employee_user_id: string;
  inspection_evaluation_id: string;
  title: string;
  description: string;
  severity: ImprovementOrder['severity'];
  due_at: string | null;
  status: ImprovementStatus;
  assigned_to: string | null;
}

interface FollowupRow extends SyncRow {
  id: string;
  tenant_id: string;
  improvement_order_id: string;
  actor_user_id: string | null;
  actor_name_snapshot: string;
  action: string;
  note: string | null;
  photo_uri: string | null;
}

function mapOrder(row: OrderRow): ImprovementOrder {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    employeeUserId: row.employee_user_id,
    inspectionEvaluationId: row.inspection_evaluation_id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    dueAt: row.due_at,
    status: row.status,
    assignedTo: row.assigned_to,
    ...mapSync(row),
  };
}

function mapFollowup(row: FollowupRow): ImprovementFollowup {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    improvementOrderId: row.improvement_order_id,
    actorUserId: row.actor_user_id,
    actorNameSnapshot: row.actor_name_snapshot,
    action: row.action,
    note: row.note,
    photoUri: row.photo_uri,
    ...mapSync(row),
  };
}

export async function insertImprovementOrder(input: {
  tenantId: string;
  siteId: string;
  employeeUserId: string;
  inspectionEvaluationId: string;
  title: string;
  description: string;
  severity: ImprovementOrder['severity'];
  dueAt?: string | null;
  assignedTo?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ImprovementOrder> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO improvement_orders (
      id, tenant_id, site_id, employee_user_id, inspection_evaluation_id, title, description, severity, due_at, status, assigned_to,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.employeeUserId,
      input.inspectionEvaluationId,
      input.title,
      input.description,
      input.severity,
      input.dueAt ?? null,
      input.assignedTo ?? input.employeeUserId,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getImprovementOrderById(id, input.tenantId);
  if (!created) throw new Error('建立改善要求失敗');
  return created;
}

export async function getImprovementOrderById(id: string, tenantId?: string | null): Promise<ImprovementOrder | null> {
  const row = tenantId
    ? await getDatabase().getFirst<OrderRow>(
        'SELECT * FROM improvement_orders WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<OrderRow>(
        'SELECT * FROM improvement_orders WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapOrder(row) : null;
}

export async function listImprovementOrders(
  tenantId: string,
  input?: {
    employeeUserId?: string | null;
    siteId?: string | null;
    status?: ImprovementStatus | null;
    overdueOnly?: boolean;
  },
): Promise<ImprovementOrder[]> {
  const rows = await getDatabase().getAll<OrderRow>(
    `SELECT * FROM improvement_orders WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId],
  );
  const now = nowIso();
  return rows
    .map(mapOrder)
    .filter((item) => {
      if (input?.employeeUserId && item.employeeUserId !== input.employeeUserId) return false;
      if (input?.siteId && item.siteId !== input.siteId) return false;
      if (input?.status && item.status !== input.status) return false;
      if (input?.overdueOnly) {
        if (!item.dueAt || item.dueAt >= now) return false;
        if (item.status === 'verified' || item.status === 'closed') return false;
      }
      return true;
    });
}

export async function updateImprovementOrderStatus(
  id: string,
  tenantId: string,
  status: ImprovementStatus,
): Promise<ImprovementOrder> {
  const current = await getImprovementOrderById(id, tenantId);
  if (!current) throw new Error('找不到改善要求');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE improvement_orders SET status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [status, ts, id, tenantId],
  );
  const updated = await getImprovementOrderById(id, tenantId);
  if (!updated) throw new Error('更新改善要求失敗');
  return updated;
}

export async function insertImprovementFollowup(input: {
  tenantId: string;
  improvementOrderId: string;
  actorUserId: string | null;
  actorNameSnapshot: string;
  action: string;
  note?: string | null;
  photoUri?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ImprovementFollowup> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO improvement_followups (
      id, tenant_id, improvement_order_id, actor_user_id, actor_name_snapshot, action, note, photo_uri,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.improvementOrderId,
      input.actorUserId,
      input.actorNameSnapshot,
      input.action,
      input.note ?? null,
      input.photoUri ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<FollowupRow>(
    'SELECT * FROM improvement_followups WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入改善追蹤失敗');
  return mapFollowup(row);
}

export async function listImprovementFollowups(tenantId: string, orderId: string): Promise<ImprovementFollowup[]> {
  const rows = await getDatabase().getAll<FollowupRow>(
    `SELECT * FROM improvement_followups
     WHERE tenant_id = ? AND improvement_order_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [tenantId, orderId],
  );
  return rows.map(mapFollowup);
}
