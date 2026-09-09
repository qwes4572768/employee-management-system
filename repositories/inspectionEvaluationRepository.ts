import { getDatabase } from '@/database/runtime';
import type { InspectionGrade } from '@/constants/inspection';
import type { InspectionEvaluation, InspectionEvaluationItem, InspectionEvidence } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface EvalRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  inspection_session_id: string;
  employee_user_id: string;
  inspector_user_id: string;
  total_score: number;
  max_score: number;
  weighted_score: number;
  grade: InspectionGrade;
  summary: string | null;
  major_deficiency: number;
  revises_evaluation_id: string | null;
  status: 'draft' | 'completed' | 'voided';
}

interface ItemRow extends SyncRow {
  id: string;
  tenant_id: string;
  evaluation_id: string;
  criteria_id: string;
  criteria_key_snapshot: string;
  criteria_name_snapshot: string;
  score: number;
  max_score: number;
  weight: number;
  comment: string | null;
  is_abnormal: number;
  source_patrol_exception_id: string | null;
  source_patrol_task_point_id: string | null;
}

interface EvidenceRow extends SyncRow {
  id: string;
  tenant_id: string;
  inspection_session_id: string;
  evaluation_id: string | null;
  kind: string;
  local_uri: string;
  watermark_uri: string | null;
  captured_by: string | null;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
}

function mapEval(row: EvalRow): InspectionEvaluation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    inspectionSessionId: row.inspection_session_id,
    employeeUserId: row.employee_user_id,
    inspectorUserId: row.inspector_user_id,
    totalScore: row.total_score,
    maxScore: row.max_score,
    weightedScore: row.weighted_score,
    grade: row.grade,
    summary: row.summary,
    majorDeficiency: boolFromSql(row.major_deficiency),
    revisesEvaluationId: row.revises_evaluation_id,
    status: row.status,
    ...mapSync(row),
  };
}

function mapItem(row: ItemRow): InspectionEvaluationItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    evaluationId: row.evaluation_id,
    criteriaId: row.criteria_id,
    criteriaKeySnapshot: row.criteria_key_snapshot,
    criteriaNameSnapshot: row.criteria_name_snapshot,
    score: row.score,
    maxScore: row.max_score,
    weight: row.weight,
    comment: row.comment,
    isAbnormal: boolFromSql(row.is_abnormal),
    sourcePatrolExceptionId: row.source_patrol_exception_id,
    sourcePatrolTaskPointId: row.source_patrol_task_point_id,
    ...mapSync(row),
  };
}

function mapEvidence(row: EvidenceRow): InspectionEvidence {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    inspectionSessionId: row.inspection_session_id,
    evaluationId: row.evaluation_id,
    kind: row.kind,
    localUri: row.local_uri,
    watermarkUri: row.watermark_uri,
    capturedBy: row.captured_by,
    capturedAt: row.captured_at,
    latitude: row.latitude,
    longitude: row.longitude,
    description: row.description,
    ...mapSync(row),
  };
}

export async function insertInspectionEvaluation(input: {
  tenantId: string;
  siteId: string;
  inspectionSessionId: string;
  employeeUserId: string;
  inspectorUserId: string;
  totalScore: number;
  maxScore: number;
  weightedScore: number;
  grade: InspectionGrade;
  summary?: string | null;
  majorDeficiency: boolean;
  revisesEvaluationId?: string | null;
  status: 'draft' | 'completed' | 'voided';
  createdBy: string | null;
  deviceId: string | null;
}): Promise<InspectionEvaluation> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO inspection_evaluations (
      id, tenant_id, site_id, inspection_session_id, employee_user_id, inspector_user_id,
      total_score, max_score, weighted_score, grade, summary, major_deficiency, revises_evaluation_id, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.inspectionSessionId,
      input.employeeUserId,
      input.inspectorUserId,
      input.totalScore,
      input.maxScore,
      input.weightedScore,
      input.grade,
      input.summary ?? null,
      sqlBool(input.majorDeficiency),
      input.revisesEvaluationId ?? null,
      input.status,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getInspectionEvaluationById(id, input.tenantId);
  if (!created) throw new Error('建立評核失敗');
  return created;
}

export async function getInspectionEvaluationById(id: string, tenantId?: string | null): Promise<InspectionEvaluation | null> {
  const row = tenantId
    ? await getDatabase().getFirst<EvalRow>(
        'SELECT * FROM inspection_evaluations WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<EvalRow>(
        'SELECT * FROM inspection_evaluations WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapEval(row) : null;
}

export async function listInspectionEvaluations(
  tenantId: string,
  input?: { sessionId?: string | null; employeeUserId?: string | null; siteId?: string | null },
): Promise<InspectionEvaluation[]> {
  const rows = await getDatabase().getAll<EvalRow>(
    `SELECT * FROM inspection_evaluations WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows
    .map(mapEval)
    .filter(
      (item) =>
        (!input?.sessionId || item.inspectionSessionId === input.sessionId) &&
        (!input?.employeeUserId || item.employeeUserId === input.employeeUserId) &&
        (!input?.siteId || item.siteId === input.siteId),
    );
}

export async function updateInspectionEvaluation(
  id: string,
  tenantId: string,
  patch: Partial<Pick<InspectionEvaluation, 'totalScore' | 'maxScore' | 'weightedScore' | 'grade' | 'summary' | 'majorDeficiency' | 'status'>>,
): Promise<InspectionEvaluation> {
  const current = await getInspectionEvaluationById(id, tenantId);
  if (!current) throw new Error('找不到評核');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE inspection_evaluations SET
      total_score = ?, max_score = ?, weighted_score = ?, grade = ?, summary = ?,
      major_deficiency = ?, status = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.totalScore ?? current.totalScore,
      patch.maxScore ?? current.maxScore,
      patch.weightedScore ?? current.weightedScore,
      patch.grade ?? current.grade,
      patch.summary === undefined ? current.summary : patch.summary,
      sqlBool(patch.majorDeficiency ?? current.majorDeficiency),
      patch.status ?? current.status,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getInspectionEvaluationById(id, tenantId);
  if (!updated) throw new Error('更新評核失敗');
  return updated;
}

export async function insertEvaluationItem(input: {
  tenantId: string;
  evaluationId: string;
  criteriaId: string;
  criteriaKeySnapshot: string;
  criteriaNameSnapshot: string;
  score: number;
  maxScore: number;
  weight: number;
  comment?: string | null;
  isAbnormal: boolean;
  sourcePatrolExceptionId?: string | null;
  sourcePatrolTaskPointId?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<InspectionEvaluationItem> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO inspection_evaluation_items (
      id, tenant_id, evaluation_id, criteria_id, criteria_key_snapshot, criteria_name_snapshot,
      score, max_score, weight, comment, is_abnormal, source_patrol_exception_id, source_patrol_task_point_id,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.evaluationId,
      input.criteriaId,
      input.criteriaKeySnapshot,
      input.criteriaNameSnapshot,
      input.score,
      input.maxScore,
      input.weight,
      input.comment ?? null,
      sqlBool(input.isAbnormal),
      input.sourcePatrolExceptionId ?? null,
      input.sourcePatrolTaskPointId ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<ItemRow>(
    'SELECT * FROM inspection_evaluation_items WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入評核細項失敗');
  return mapItem(row);
}

export async function listEvaluationItems(tenantId: string, evaluationId: string): Promise<InspectionEvaluationItem[]> {
  const rows = await getDatabase().getAll<ItemRow>(
    `SELECT * FROM inspection_evaluation_items WHERE tenant_id = ? AND evaluation_id = ? AND deleted_at IS NULL`,
    [tenantId, evaluationId],
  );
  return rows.map(mapItem);
}

export async function deleteEvaluationItems(tenantId: string, evaluationId: string): Promise<void> {
  await getDatabase().run(
    `UPDATE inspection_evaluation_items SET deleted_at = ?, updated_at = ?, version = version + 1
     WHERE tenant_id = ? AND evaluation_id = ? AND deleted_at IS NULL`,
    [nowIso(), nowIso(), tenantId, evaluationId],
  );
}

export async function insertInspectionEvidence(input: {
  tenantId: string;
  inspectionSessionId: string;
  evaluationId?: string | null;
  kind: string;
  localUri: string;
  watermarkUri?: string | null;
  capturedBy: string | null;
  capturedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<InspectionEvidence> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO inspection_evidence (
      id, tenant_id, inspection_session_id, evaluation_id, kind, local_uri, watermark_uri,
      captured_by, captured_at, latitude, longitude, description,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.inspectionSessionId,
      input.evaluationId ?? null,
      input.kind,
      input.localUri,
      input.watermarkUri ?? null,
      input.capturedBy,
      input.capturedAt,
      input.latitude ?? null,
      input.longitude ?? null,
      input.description ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<EvidenceRow>(
    'SELECT * FROM inspection_evidence WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('保存督勤照片失敗');
  return mapEvidence(row);
}

export async function listInspectionEvidence(tenantId: string, sessionId: string): Promise<InspectionEvidence[]> {
  const rows = await getDatabase().getAll<EvidenceRow>(
    `SELECT * FROM inspection_evidence WHERE tenant_id = ? AND inspection_session_id = ? AND deleted_at IS NULL`,
    [tenantId, sessionId],
  );
  return rows.map(mapEvidence);
}
