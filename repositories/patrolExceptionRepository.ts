import { getDatabase } from '@/database/runtime';
import type { PatrolExceptionCategory, PatrolExceptionSeverity, PatrolExceptionStatus } from '@/constants/patrol';
import type { PatrolException } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface ExceptionRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  patrol_task_id: string;
  patrol_task_point_id: string | null;
  reported_by: string;
  category: string;
  severity: string;
  description: string;
  status: PatrolExceptionStatus;
  reported_at: string;
  resolved_at: string | null;
  source_module: string;
}

function mapException(row: ExceptionRow): PatrolException {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    patrolTaskId: row.patrol_task_id,
    patrolTaskPointId: row.patrol_task_point_id,
    reportedBy: row.reported_by,
    category: row.category as PatrolExceptionCategory,
    severity: row.severity as PatrolExceptionSeverity,
    description: row.description,
    status: row.status,
    reportedAt: row.reported_at,
    resolvedAt: row.resolved_at,
    sourceModule: row.source_module,
    ...mapSync(row),
  };
}

export async function insertPatrolException(input: {
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolTaskPointId?: string | null;
  reportedBy: string;
  category: PatrolExceptionCategory;
  severity: PatrolExceptionSeverity;
  description: string;
  reportedAt: string;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<PatrolException> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO patrol_exceptions (
      id, tenant_id, site_id, patrol_task_id, patrol_task_point_id, reported_by,
      category, severity, description, status, reported_at, resolved_at, source_module,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL, 'patrol', ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.patrolTaskId,
      input.patrolTaskPointId ?? null,
      input.reportedBy,
      input.category,
      input.severity,
      input.description,
      input.reportedAt,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getPatrolExceptionById(id, input.tenantId);
  if (!created) throw new Error('建立巡邏異常失敗');
  return created;
}

export async function getPatrolExceptionById(id: string, tenantId?: string | null): Promise<PatrolException | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ExceptionRow>(
        'SELECT * FROM patrol_exceptions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<ExceptionRow>(
        'SELECT * FROM patrol_exceptions WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapException(row) : null;
}

export async function listPatrolExceptions(
  tenantId: string,
  input?: { siteId?: string | null; taskId?: string | null; status?: PatrolExceptionStatus | null },
): Promise<PatrolException[]> {
  const rows = await getDatabase().getAll<ExceptionRow>(
    `SELECT * FROM patrol_exceptions WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY reported_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapException)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.taskId || item.patrolTaskId === input.taskId) &&
        (!input?.status || item.status === input.status),
    );
}

export async function updatePatrolExceptionStatus(
  id: string,
  tenantId: string,
  status: PatrolExceptionStatus,
  resolvedAt?: string | null,
): Promise<PatrolException> {
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE patrol_exceptions SET
      status = ?, resolved_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [status, resolvedAt ?? (status === 'resolved' ? ts : null), ts, id, tenantId],
  );
  const updated = await getPatrolExceptionById(id, tenantId);
  if (!updated) throw new Error('更新巡邏異常失敗');
  return updated;
}
