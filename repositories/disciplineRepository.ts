import { getDatabase } from '@/database/runtime';
import type { DisciplineActionKey, DisciplineDecision } from '@/constants/inspection';
import type { DisciplinaryRecommendation, DisciplinaryReview } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface RecRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  inspection_evaluation_id: string | null;
  employee_user_id: string;
  recommended_by: string;
  action_key: DisciplineActionKey;
  action_label_snapshot: string;
  reason: string;
  compensation_claim_amount: number | null;
  status: DisciplinaryRecommendation['status'];
}

interface ReviewRow extends SyncRow {
  id: string;
  tenant_id: string;
  recommendation_id: string;
  reviewer_user_id: string;
  decision: DisciplineDecision;
  final_action: string | null;
  review_note: string | null;
  reviewed_at: string;
}

function mapRec(row: RecRow): DisciplinaryRecommendation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    inspectionEvaluationId: row.inspection_evaluation_id,
    employeeUserId: row.employee_user_id,
    recommendedBy: row.recommended_by,
    actionKey: row.action_key,
    actionLabelSnapshot: row.action_label_snapshot,
    reason: row.reason,
    compensationClaimAmount: row.compensation_claim_amount,
    status: row.status,
    ...mapSync(row),
  };
}

function mapReview(row: ReviewRow): DisciplinaryReview {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    recommendationId: row.recommendation_id,
    reviewerUserId: row.reviewer_user_id,
    decision: row.decision,
    finalAction: row.final_action,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    ...mapSync(row),
  };
}

export async function insertDisciplinaryRecommendation(input: {
  tenantId: string;
  siteId: string;
  inspectionEvaluationId?: string | null;
  employeeUserId: string;
  recommendedBy: string;
  actionKey: DisciplineActionKey;
  actionLabelSnapshot: string;
  reason: string;
  compensationClaimAmount?: number | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<DisciplinaryRecommendation> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO disciplinary_recommendations (
      id, tenant_id, site_id, inspection_evaluation_id, employee_user_id, recommended_by,
      action_key, action_label_snapshot, reason, compensation_claim_amount, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.inspectionEvaluationId ?? null,
      input.employeeUserId,
      input.recommendedBy,
      input.actionKey,
      input.actionLabelSnapshot,
      input.reason,
      input.compensationClaimAmount ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getDisciplinaryRecommendationById(id, input.tenantId);
  if (!created) throw new Error('建立懲處建議失敗');
  return created;
}

export async function getDisciplinaryRecommendationById(
  id: string,
  tenantId?: string | null,
): Promise<DisciplinaryRecommendation | null> {
  const row = tenantId
    ? await getDatabase().getFirst<RecRow>(
        'SELECT * FROM disciplinary_recommendations WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<RecRow>(
        'SELECT * FROM disciplinary_recommendations WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapRec(row) : null;
}

export async function listDisciplinaryRecommendations(
  tenantId: string,
  input?: { siteId?: string | null; status?: DisciplinaryRecommendation['status'] | null; employeeUserId?: string | null },
): Promise<DisciplinaryRecommendation[]> {
  const rows = await getDatabase().getAll<RecRow>(
    `SELECT * FROM disciplinary_recommendations WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapRec)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) &&
        (!input?.status || item.status === input.status) &&
        (!input?.employeeUserId || item.employeeUserId === input.employeeUserId),
    );
}

export async function updateDisciplinaryRecommendationStatus(
  id: string,
  tenantId: string,
  status: DisciplinaryRecommendation['status'],
): Promise<DisciplinaryRecommendation> {
  const current = await getDisciplinaryRecommendationById(id, tenantId);
  if (!current) throw new Error('找不到懲處建議');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE disciplinary_recommendations SET status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [status, ts, id, tenantId],
  );
  const updated = await getDisciplinaryRecommendationById(id, tenantId);
  if (!updated) throw new Error('更新懲處建議失敗');
  return updated;
}

export async function insertDisciplinaryReview(input: {
  tenantId: string;
  recommendationId: string;
  reviewerUserId: string;
  decision: DisciplineDecision;
  finalAction?: string | null;
  reviewNote?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<DisciplinaryReview> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO disciplinary_reviews (
      id, tenant_id, recommendation_id, reviewer_user_id, decision, final_action, review_note, reviewed_at,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.recommendationId,
      input.reviewerUserId,
      input.decision,
      input.finalAction ?? null,
      input.reviewNote ?? null,
      ts,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<ReviewRow>(
    'SELECT * FROM disciplinary_reviews WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入懲處審核失敗');
  return mapReview(row);
}

export async function listDisciplinaryReviews(tenantId: string, recommendationId: string): Promise<DisciplinaryReview[]> {
  const rows = await getDatabase().getAll<ReviewRow>(
    `SELECT * FROM disciplinary_reviews
     WHERE tenant_id = ? AND recommendation_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [tenantId, recommendationId],
  );
  return rows.map(mapReview);
}
