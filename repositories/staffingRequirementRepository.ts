import { getDatabase } from '@/database/runtime';
import type { SiteShiftRequirement, SiteShiftRequirementStatus } from '@/types';
import type { StaffingMode } from '@/constants/staffing';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface RequirementRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  shift_template_id: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  required_headcount: number;
  staffing_mode: string | null;
  weekday: number | null;
  status: SiteShiftRequirementStatus;
}

function mapRequirement(row: RequirementRow): SiteShiftRequirement {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    shiftTemplateId: row.shift_template_id,
    effectiveStartDate: row.effective_start_date,
    effectiveEndDate: row.effective_end_date,
    requiredHeadcount: row.required_headcount,
    staffingMode: (row.staffing_mode as StaffingMode | null) ?? null,
    weekday: row.weekday,
    status: row.status,
    ...mapSync(row),
  };
}

export interface StaffingRequirementInsert {
  tenantId: string;
  siteId: string;
  shiftTemplateId?: string | null;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  requiredHeadcount: number;
  staffingMode?: StaffingMode | null;
  weekday?: number | null;
  createdBy: string | null;
  deviceId: string | null;
}

export async function insertStaffingRequirement(input: StaffingRequirementInsert): Promise<SiteShiftRequirement> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO site_shift_requirements (
      id, tenant_id, site_id, shift_template_id, effective_start_date, effective_end_date,
      required_headcount, staffing_mode, weekday, status,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.shiftTemplateId ?? null,
      input.effectiveStartDate,
      input.effectiveEndDate ?? null,
      input.requiredHeadcount,
      input.staffingMode ?? null,
      input.weekday ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getStaffingRequirementById(id, input.tenantId);
  if (!created) {
    throw new Error('建立人力需求失敗');
  }
  return created;
}

export async function getStaffingRequirementById(
  id: string,
  tenantId?: string | null,
): Promise<SiteShiftRequirement | null> {
  const row = tenantId
    ? await getDatabase().getFirst<RequirementRow>(
        'SELECT * FROM site_shift_requirements WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<RequirementRow>(
        'SELECT * FROM site_shift_requirements WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapRequirement(row) : null;
}

export async function listStaffingRequirements(
  tenantId: string,
  siteId?: string | null,
): Promise<SiteShiftRequirement[]> {
  const rows = siteId
    ? await getDatabase().getAll<RequirementRow>(
        `SELECT * FROM site_shift_requirements
         WHERE tenant_id = ? AND site_id = ? AND deleted_at IS NULL
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, effective_start_date DESC, created_at DESC`,
        [tenantId, siteId],
      )
    : await getDatabase().getAll<RequirementRow>(
        `SELECT * FROM site_shift_requirements
         WHERE tenant_id = ? AND deleted_at IS NULL
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, site_id, effective_start_date DESC, created_at DESC`,
        [tenantId],
      );
  return rows.map(mapRequirement);
}

export async function listActiveStaffingRequirementsForSiteDate(
  tenantId: string,
  siteId: string,
  workDate: string,
): Promise<SiteShiftRequirement[]> {
  const rows = await getDatabase().getAll<RequirementRow>(
    `SELECT * FROM site_shift_requirements
     WHERE tenant_id = ? AND site_id = ? AND deleted_at IS NULL AND status = 'active'
       AND effective_start_date <= ?
       AND (effective_end_date IS NULL OR effective_end_date >= ?)
     ORDER BY effective_start_date DESC, updated_at DESC`,
    [tenantId, siteId, workDate, workDate],
  );
  return rows.map(mapRequirement);
}

export async function updateStaffingRequirement(
  id: string,
  tenantId: string,
  patch: Partial<{
    shiftTemplateId: string | null;
    effectiveStartDate: string;
    effectiveEndDate: string | null;
    requiredHeadcount: number;
    staffingMode: StaffingMode | null;
    weekday: number | null;
    status: SiteShiftRequirementStatus;
  }>,
): Promise<SiteShiftRequirement> {
  const current = await getStaffingRequirementById(id, tenantId);
  if (!current) {
    throw new Error('找不到人力需求');
  }
  await getDatabase().run(
    `UPDATE site_shift_requirements SET
      shift_template_id = ?, effective_start_date = ?, effective_end_date = ?,
      required_headcount = ?, staffing_mode = ?, weekday = ?, status = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      patch.shiftTemplateId === undefined ? current.shiftTemplateId : patch.shiftTemplateId,
      patch.effectiveStartDate ?? current.effectiveStartDate,
      patch.effectiveEndDate === undefined ? current.effectiveEndDate : patch.effectiveEndDate,
      patch.requiredHeadcount ?? current.requiredHeadcount,
      patch.staffingMode === undefined ? current.staffingMode : patch.staffingMode,
      patch.weekday === undefined ? current.weekday : patch.weekday,
      patch.status ?? current.status,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getStaffingRequirementById(id, tenantId);
  if (!updated) {
    throw new Error('更新人力需求失敗');
  }
  return updated;
}

export async function softDeleteStaffingRequirement(id: string, tenantId: string): Promise<void> {
  const current = await getStaffingRequirementById(id, tenantId);
  if (!current) {
    throw new Error('找不到人力需求');
  }
  await getDatabase().run(
    `UPDATE site_shift_requirements SET
      status = 'inactive', deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [nowIso(), nowIso(), id, tenantId],
  );
}
