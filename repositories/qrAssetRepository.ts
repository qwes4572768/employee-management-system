import { getDatabase } from '@/database/runtime';
import type { QrAssetStatus, QrAssetType } from '@/constants/qr';
import type { QrAsset } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface QrAssetRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  asset_type: string;
  target_type: string;
  target_id: string;
  qr_code: string;
  display_name: string;
  status: QrAssetStatus;
  deactivated_by: string | null;
  deactivated_at: string | null;
  deactivate_reason: string | null;
  last_scan_at: string | null;
  scan_count: number;
}

function mapAsset(row: QrAssetRow): QrAsset {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    assetType: row.asset_type as QrAssetType,
    targetType: row.target_type as QrAssetType,
    targetId: row.target_id,
    qrCode: row.qr_code,
    displayName: row.display_name,
    status: row.status,
    deactivatedBy: row.deactivated_by,
    deactivatedAt: row.deactivated_at,
    deactivateReason: row.deactivate_reason,
    lastScanAt: row.last_scan_at,
    scanCount: row.scan_count,
    ...mapSync(row),
  };
}

export interface QrAssetInsert {
  tenantId: string;
  siteId?: string | null;
  assetType: QrAssetType;
  targetType: QrAssetType;
  targetId: string;
  qrCode: string;
  displayName: string;
  createdBy: string | null;
  deviceId: string | null;
}

export async function insertQrAsset(input: QrAssetInsert): Promise<QrAsset> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO qr_assets (
      id, tenant_id, site_id, asset_type, target_type, target_id, qr_code, display_name, status,
      created_by, created_at, deactivated_by, deactivated_at, deactivate_reason, last_scan_at, scan_count,
      updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL, NULL, NULL, 0, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId ?? null,
      input.assetType,
      input.targetType,
      input.targetId,
      input.qrCode,
      input.displayName,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getQrAssetById(id, input.tenantId);
  if (!created) throw new Error('建立 QR 資產失敗');
  return created;
}

export async function getQrAssetById(id: string, tenantId?: string | null): Promise<QrAsset | null> {
  const row = tenantId
    ? await getDatabase().getFirst<QrAssetRow>(
        'SELECT * FROM qr_assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<QrAssetRow>('SELECT * FROM qr_assets WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapAsset(row) : null;
}

export async function getQrAssetByCode(qrCode: string, tenantId?: string | null): Promise<QrAsset | null> {
  const row = tenantId
    ? await getDatabase().getFirst<QrAssetRow>(
        'SELECT * FROM qr_assets WHERE qr_code = ? AND tenant_id = ? AND deleted_at IS NULL',
        [qrCode, tenantId],
      )
    : await getDatabase().getFirst<QrAssetRow>(
        'SELECT * FROM qr_assets WHERE qr_code = ? AND deleted_at IS NULL',
        [qrCode],
      );
  return row ? mapAsset(row) : null;
}

export async function getActiveQrAssetForTarget(
  tenantId: string,
  targetType: QrAssetType,
  targetId: string,
): Promise<QrAsset | null> {
  const row = await getDatabase().getFirst<QrAssetRow>(
    `SELECT * FROM qr_assets
     WHERE tenant_id = ? AND target_type = ? AND target_id = ?
       AND status = 'active' AND deleted_at IS NULL`,
    [tenantId, targetType, targetId],
  );
  return row ? mapAsset(row) : null;
}

export async function listQrAssets(
  tenantId: string,
  input?: { assetType?: QrAssetType | null; query?: string | null },
): Promise<QrAsset[]> {
  const rows = await getDatabase().getAll<QrAssetRow>(
    `SELECT * FROM qr_assets WHERE tenant_id = ? AND deleted_at IS NULL
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC`,
    [tenantId],
  );
  let list = rows.map(mapAsset);
  if (input?.assetType) {
    list = list.filter((item) => item.assetType === input.assetType);
  }
  const q = input?.query?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (item) =>
        item.displayName.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.qrCode.toLowerCase().includes(q) ||
        item.targetId.toLowerCase().includes(q),
    );
  }
  return list;
}

export async function deactivateQrAsset(
  id: string,
  tenantId: string,
  input: { deactivatedBy: string | null; reason: string },
): Promise<QrAsset> {
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE qr_assets SET
      status = 'inactive', deactivated_by = ?, deactivated_at = ?, deactivate_reason = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [input.deactivatedBy, ts, input.reason, ts, id, tenantId],
  );
  const updated = await getQrAssetById(id, tenantId);
  if (!updated) throw new Error('停用 QR 失敗');
  return updated;
}

export async function reactivateQrAsset(id: string, tenantId: string): Promise<QrAsset> {
  const ts = nowIso();
  await getDatabase().run(
    `UPDATE qr_assets SET
      status = 'active', deactivated_by = NULL, deactivated_at = NULL, deactivate_reason = NULL,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [ts, id, tenantId],
  );
  const updated = await getQrAssetById(id, tenantId);
  if (!updated) throw new Error('重新啟用 QR 失敗');
  return updated;
}

export async function recordQrAssetScan(id: string, tenantId: string, scannedAt: string): Promise<void> {
  await getDatabase().run(
    `UPDATE qr_assets SET
      last_scan_at = ?, scan_count = scan_count + 1, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [scannedAt, scannedAt, id, tenantId],
  );
}
