import { getDatabase } from '@/database/runtime';
import type { AuditLog, AuditResult } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

interface AuditRow {
  id: string;
  tenant_id: string | null;
  site_id: string | null;
  actor_user_id: string | null;
  actor_name_snapshot: string;
  actor_account_snapshot: string;
  actor_role_snapshot: string;
  action: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  target_display_name: string | null;
  description: string;
  before_data: string | null;
  after_data: string | null;
  result: AuditResult;
  device_id: string | null;
  app_version: string | null;
  created_at: string;
}

function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    actorUserId: row.actor_user_id,
    actorNameSnapshot: row.actor_name_snapshot,
    actorAccountSnapshot: row.actor_account_snapshot,
    actorRoleSnapshot: row.actor_role_snapshot,
    action: row.action,
    module: row.module,
    targetType: row.target_type,
    targetId: row.target_id,
    targetDisplayName: row.target_display_name,
    description: row.description,
    beforeData: row.before_data,
    afterData: row.after_data,
    result: row.result,
    deviceId: row.device_id,
    appVersion: row.app_version,
    createdAt: row.created_at,
  };
}

export interface AuditInsert {
  tenantId: string | null;
  siteId: string | null;
  actorUserId: string | null;
  actorNameSnapshot: string;
  actorAccountSnapshot: string;
  actorRoleSnapshot: string;
  action: string;
  module: string;
  targetType?: string | null;
  targetId?: string | null;
  targetDisplayName?: string | null;
  description: string;
  beforeData?: string | null;
  afterData?: string | null;
  result?: AuditResult;
  deviceId: string | null;
  appVersion: string | null;
}

export async function insertAuditLog(input: AuditInsert): Promise<AuditLog> {
  const id = createId();
  const createdAt = nowIso();
  await getDatabase().run(
    `INSERT INTO audit_logs (
      id, tenant_id, site_id, actor_user_id, actor_name_snapshot, actor_account_snapshot,
      actor_role_snapshot, action, module, target_type, target_id, target_display_name,
      description, before_data, after_data, result, device_id, app_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.actorUserId,
      input.actorNameSnapshot,
      input.actorAccountSnapshot,
      input.actorRoleSnapshot,
      input.action,
      input.module,
      input.targetType ?? null,
      input.targetId ?? null,
      input.targetDisplayName ?? null,
      input.description,
      input.beforeData ?? null,
      input.afterData ?? null,
      input.result ?? 'success',
      input.deviceId,
      input.appVersion,
      createdAt,
    ],
  );
  const row = await getDatabase().getFirst<AuditRow>('SELECT * FROM audit_logs WHERE id = ?', [id]);
  if (!row) {
    throw new Error('寫入操作日誌失敗');
  }
  return mapAudit(row);
}

export async function listAuditLogs(tenantId: string, limit = 200): Promise<AuditLog[]> {
  const rows = await getDatabase().getAll<AuditRow>(
    'SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
    [tenantId, limit],
  );
  return rows.map(mapAudit);
}

export async function countAuditLogs(tenantId: string): Promise<number> {
  const row = await getDatabase().getFirst<{ c: number }>(
    'SELECT COUNT(*) as c FROM audit_logs WHERE tenant_id = ?',
    [tenantId],
  );
  return row?.c ?? 0;
}
