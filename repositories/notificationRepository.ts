import { getDatabase } from '@/database/runtime';
import type { AppNotification } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

export async function insertNotification(input: {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  relatedId?: string | null;
}): Promise<AppNotification> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO app_notifications (id, tenant_id, user_id, title, body, kind, related_id, read_at, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
    [id, input.tenantId, input.userId, input.title, input.body, input.kind, input.relatedId ?? null, ts],
  );
  return {
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    title: input.title,
    body: input.body,
    kind: input.kind,
    relatedId: input.relatedId ?? null,
    readAt: null,
    createdAt: ts,
    deletedAt: null,
  };
}

export async function listNotifications(tenantId: string, userId: string): Promise<AppNotification[]> {
  return getDatabase().getAll<AppNotification>(
    `SELECT id, tenant_id as tenantId, user_id as userId, title, body, kind,
            related_id as relatedId, read_at as readAt, created_at as createdAt, deleted_at as deletedAt
     FROM app_notifications
     WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, userId],
  );
}

export async function markNotificationRead(id: string, tenantId: string, userId: string): Promise<void> {
  await getDatabase().run(
    `UPDATE app_notifications SET read_at = ? WHERE id = ? AND tenant_id = ? AND user_id = ?`,
    [nowIso(), id, tenantId, userId],
  );
}
