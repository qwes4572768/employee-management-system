import { getDatabase } from '@/database/runtime';
import type { QrScanResult } from '@/constants/qr';
import type { QrScanLog } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

interface ScanRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  qr_asset_id: string | null;
  scanner_user_id: string | null;
  scanner_name_snapshot: string;
  scanner_role_snapshot: string | null;
  scanned_code: string;
  scan_result: QrScanResult;
  scanned_at: string;
  latitude: number | null;
  longitude: number | null;
  device_id: string | null;
  app_version: string | null;
  created_at: string;
}

function mapLog(row: ScanRow): QrScanLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    qrAssetId: row.qr_asset_id,
    scannerUserId: row.scanner_user_id,
    scannerNameSnapshot: row.scanner_name_snapshot,
    scannerRoleSnapshot: row.scanner_role_snapshot,
    scannedCode: row.scanned_code,
    scanResult: row.scan_result,
    scannedAt: row.scanned_at,
    latitude: row.latitude,
    longitude: row.longitude,
    deviceId: row.device_id,
    appVersion: row.app_version,
    createdAt: row.created_at,
  };
}

export interface QrScanLogInsert {
  tenantId: string;
  siteId?: string | null;
  qrAssetId?: string | null;
  scannerUserId: string | null;
  scannerNameSnapshot: string;
  scannerRoleSnapshot: string | null;
  scannedCode: string;
  scanResult: QrScanResult;
  scannedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
  deviceId: string | null;
  appVersion: string | null;
}

export async function insertQrScanLog(input: QrScanLogInsert): Promise<QrScanLog> {
  const id = createId();
  const ts = input.scannedAt ?? nowIso();
  await getDatabase().run(
    `INSERT INTO qr_scan_logs (
      id, tenant_id, site_id, qr_asset_id, scanner_user_id, scanner_name_snapshot, scanner_role_snapshot,
      scanned_code, scan_result, scanned_at, latitude, longitude, device_id, app_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.tenantId,
      input.siteId ?? null,
      input.qrAssetId ?? null,
      input.scannerUserId,
      input.scannerNameSnapshot,
      input.scannerRoleSnapshot,
      input.scannedCode,
      input.scanResult,
      ts,
      input.latitude ?? null,
      input.longitude ?? null,
      input.deviceId,
      input.appVersion,
      ts,
    ],
  );
  const created = await getQrScanLogById(id, input.tenantId);
  if (!created) throw new Error('建立掃描紀錄失敗');
  return created;
}

export async function getQrScanLogById(id: string, tenantId?: string | null): Promise<QrScanLog | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ScanRow>('SELECT * FROM qr_scan_logs WHERE id = ? AND tenant_id = ?', [id, tenantId])
    : await getDatabase().getFirst<ScanRow>('SELECT * FROM qr_scan_logs WHERE id = ?', [id]);
  return row ? mapLog(row) : null;
}

export async function listQrScanLogs(tenantId: string, limit = 100): Promise<QrScanLog[]> {
  const rows = await getDatabase().getAll<ScanRow>(
    `SELECT * FROM qr_scan_logs WHERE tenant_id = ? ORDER BY scanned_at DESC LIMIT ?`,
    [tenantId, limit],
  );
  return rows.map(mapLog);
}

export async function countQrScanLogsForCodeSince(
  tenantId: string,
  scannerUserId: string,
  scannedCode: string,
  sinceIso: string,
): Promise<number> {
  const row = await getDatabase().getFirst<{ c: number }>(
    `SELECT COUNT(*) as c FROM qr_scan_logs
     WHERE tenant_id = ? AND scanner_user_id = ? AND scanned_code = ? AND scanned_at >= ?`,
    [tenantId, scannerUserId, scannedCode, sinceIso],
  );
  return row?.c ?? 0;
}
