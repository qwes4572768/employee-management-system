import {
  DEFAULT_INSPECTION_POLICY,
  DEFAULT_MAJOR_CRITERIA,
  INSPECTION_CRITERIA_KEYS,
  INSPECTION_CRITERIA_LABELS,
} from '@/constants/inspection';
import { getDatabase } from '@/database/runtime';
import type { InspectionCriteria, InspectionPolicy } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface PolicyRow extends SyncRow {
  id: string;
  tenant_id: string;
  excellent_min_score: number;
  good_min_score: number;
  pass_min_score: number;
}

interface CriteriaRow extends SyncRow {
  id: string;
  tenant_id: string;
  criteria_key: string;
  display_name: string;
  max_score: number;
  weight: number;
  required: number;
  major_eligible: number;
  status: 'active' | 'inactive';
  sort_order: number;
}

function mapPolicy(row: PolicyRow): InspectionPolicy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    excellentMinScore: row.excellent_min_score,
    goodMinScore: row.good_min_score,
    passMinScore: row.pass_min_score,
    ...mapSync(row),
  };
}

function mapCriteria(row: CriteriaRow): InspectionCriteria {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    criteriaKey: row.criteria_key as InspectionCriteria['criteriaKey'],
    displayName: row.display_name,
    maxScore: row.max_score,
    weight: row.weight,
    required: boolFromSql(row.required),
    majorEligible: boolFromSql(row.major_eligible),
    status: row.status,
    sortOrder: row.sort_order,
    ...mapSync(row),
  };
}

export async function ensureInspectionCatalog(tenantId: string): Promise<void> {
  const table = await getDatabase().getFirst<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = 'inspection_policies'`,
  );
  if (!table) return;
  const existing = await getInspectionPolicy(tenantId);
  const ts = nowIso();
  if (!existing) {
    await getDatabase().run(
      `INSERT OR IGNORE INTO inspection_policies (
        id, tenant_id, excellent_min_score, good_min_score, pass_min_score,
        created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, 'local', NULL)`,
      [
        `insp-policy-${tenantId}`,
        tenantId,
        DEFAULT_INSPECTION_POLICY.excellentMinScore,
        DEFAULT_INSPECTION_POLICY.goodMinScore,
        DEFAULT_INSPECTION_POLICY.passMinScore,
        ts,
        ts,
      ],
    );
  }
  const current = await listInspectionCriteria(tenantId);
  const have = new Set(current.map((item) => item.criteriaKey));
  for (const [index, key] of INSPECTION_CRITERIA_KEYS.entries()) {
    if (have.has(key)) continue;
    await getDatabase().run(
      `INSERT OR IGNORE INTO inspection_criteria (
        id, tenant_id, criteria_key, display_name, max_score, weight, required, major_eligible,
        status, sort_order, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
      ) VALUES (?, ?, ?, ?, 5, 10, 1, ?, 'active', ?, NULL, ?, ?, NULL, 1, 'local', NULL)`,
      [
        `insp-crit-${tenantId}-${key}`,
        tenantId,
        key,
        INSPECTION_CRITERIA_LABELS[key],
        DEFAULT_MAJOR_CRITERIA.includes(key) ? 1 : 0,
        index + 1,
        ts,
        ts,
      ],
    );
  }
}

export async function getInspectionPolicy(tenantId: string): Promise<InspectionPolicy | null> {
  const row = await getDatabase().getFirst<PolicyRow>(
    'SELECT * FROM inspection_policies WHERE tenant_id = ? AND deleted_at IS NULL',
    [tenantId],
  );
  return row ? mapPolicy(row) : null;
}

export async function upsertInspectionPolicy(
  tenantId: string,
  patch: Partial<Pick<InspectionPolicy, 'excellentMinScore' | 'goodMinScore' | 'passMinScore'>>,
  actor: { userId: string | null; deviceId: string | null },
): Promise<InspectionPolicy> {
  const current = await getInspectionPolicy(tenantId);
  const ts = nowIso();
  if (!current) {
    const id = createId();
    await getDatabase().run(
      `INSERT INTO inspection_policies (
        id, tenant_id, excellent_min_score, good_min_score, pass_min_score,
        created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
      [
        id,
        tenantId,
        patch.excellentMinScore ?? 90,
        patch.goodMinScore ?? 80,
        patch.passMinScore ?? 70,
        actor.userId,
        ts,
        ts,
        actor.deviceId,
      ],
    );
  } else {
    await getDatabase().run(
      `UPDATE inspection_policies SET
        excellent_min_score = ?, good_min_score = ?, pass_min_score = ?,
        updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ? AND tenant_id = ?`,
      [
        patch.excellentMinScore ?? current.excellentMinScore,
        patch.goodMinScore ?? current.goodMinScore,
        patch.passMinScore ?? current.passMinScore,
        ts,
        current.id,
        tenantId,
      ],
    );
  }
  const updated = await getInspectionPolicy(tenantId);
  if (!updated) throw new Error('評核政策寫入失敗');
  return updated;
}

export async function insertInspectionCriteria(input: {
  tenantId: string;
  criteriaKey: InspectionCriteria['criteriaKey'];
  displayName: string;
  maxScore: number;
  weight: number;
  required: boolean;
  majorEligible: boolean;
  status?: 'active' | 'inactive';
  sortOrder: number;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<InspectionCriteria> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO inspection_criteria (
      id, tenant_id, criteria_key, display_name, max_score, weight, required, major_eligible,
      status, sort_order, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.criteriaKey,
      input.displayName,
      input.maxScore,
      input.weight,
      sqlBool(input.required),
      sqlBool(input.majorEligible),
      input.status ?? 'active',
      input.sortOrder,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getInspectionCriteriaById(id, input.tenantId);
  if (!created) throw new Error('建立評核項目失敗');
  return created;
}

export async function listInspectionCriteria(
  tenantId: string,
  input?: { status?: 'active' | 'inactive' | null },
): Promise<InspectionCriteria[]> {
  const rows = await getDatabase().getAll<CriteriaRow>(
    `SELECT * FROM inspection_criteria WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`,
    [tenantId],
  );
  return rows.map(mapCriteria).filter((item) => !input?.status || item.status === input.status);
}

export async function getInspectionCriteriaById(id: string, tenantId?: string | null): Promise<InspectionCriteria | null> {
  const row = tenantId
    ? await getDatabase().getFirst<CriteriaRow>(
        'SELECT * FROM inspection_criteria WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<CriteriaRow>(
        'SELECT * FROM inspection_criteria WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapCriteria(row) : null;
}

export async function updateInspectionCriteria(
  id: string,
  tenantId: string,
  patch: Partial<Pick<InspectionCriteria, 'displayName' | 'maxScore' | 'weight' | 'required' | 'majorEligible' | 'status' | 'sortOrder'>>,
): Promise<InspectionCriteria> {
  const current = await getInspectionCriteriaById(id, tenantId);
  if (!current) throw new Error('找不到評核項目');
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE inspection_criteria SET
      display_name = ?, max_score = ?, weight = ?, required = ?, major_eligible = ?,
      status = ?, sort_order = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.displayName ?? current.displayName,
      patch.maxScore ?? current.maxScore,
      patch.weight ?? current.weight,
      sqlBool(patch.required ?? current.required),
      sqlBool(patch.majorEligible ?? current.majorEligible),
      patch.status ?? current.status,
      patch.sortOrder ?? current.sortOrder,
      ts,
      id,
      tenantId,
    ],
  );
  const updated = await getInspectionCriteriaById(id, tenantId);
  if (!updated) throw new Error('更新評核項目失敗');
  return updated;
}
