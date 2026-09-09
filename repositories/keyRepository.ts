import { getDatabase } from '@/database/runtime';
import type { KeyTransactionType, LoanBorrowerType, ManagedKeyStatus, ManagedKeyType } from '@/constants/mobility';
import type { KeyTransaction, ManagedKey } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface KeyRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  key_code: string;
  name: string;
  description: string | null;
  storage_location: string | null;
  key_type: ManagedKeyType;
  status: ManagedKeyStatus;
  qr_asset_id: string | null;
}

interface TxRow {
  id: string;
  tenant_id: string;
  site_id: string;
  key_id: string;
  transaction_type: KeyTransactionType;
  borrower_type: LoanBorrowerType;
  borrower_user_id: string | null;
  borrower_resident_id: string | null;
  borrower_name_snapshot: string;
  purpose: string | null;
  checked_out_at: string | null;
  due_at: string | null;
  returned_at: string | null;
  condition_out: string | null;
  condition_in: string | null;
  processed_by: string | null;
  note: string | null;
  compensation_review_required: number;
  corrects_id: string | null;
  created_by: string | null;
  created_at: string;
  sync_status: string;
  device_id: string | null;
}

function mapKey(row: KeyRow): ManagedKey {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    keyCode: row.key_code,
    name: row.name,
    description: row.description,
    storageLocation: row.storage_location,
    keyType: row.key_type,
    status: row.status,
    qrAssetId: row.qr_asset_id,
    ...mapSync(row),
  };
}

function mapTx(row: TxRow): KeyTransaction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    keyId: row.key_id,
    transactionType: row.transaction_type,
    borrowerType: row.borrower_type,
    borrowerUserId: row.borrower_user_id,
    borrowerResidentId: row.borrower_resident_id,
    borrowerNameSnapshot: row.borrower_name_snapshot,
    purpose: row.purpose,
    checkedOutAt: row.checked_out_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    conditionOut: row.condition_out,
    conditionIn: row.condition_in,
    processedBy: row.processed_by,
    note: row.note,
    compensationReviewRequired: boolFromSql(row.compensation_review_required),
    correctsId: row.corrects_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    syncStatus: row.sync_status,
    deviceId: row.device_id,
  };
}

export async function insertManagedKey(input: {
  tenantId: string;
  siteId: string;
  keyCode: string;
  name: string;
  description?: string | null;
  storageLocation?: string | null;
  keyType?: ManagedKeyType;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ManagedKey> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO managed_keys (
      id, tenant_id, site_id, key_code, name, description, storage_location, key_type, status, qr_asset_id,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', NULL, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.keyCode,
      input.name,
      input.description ?? null,
      input.storageLocation ?? null,
      input.keyType ?? 'physical',
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getManagedKeyById(id, input.tenantId);
  if (!created) throw new Error('建立鑰匙失敗');
  return created;
}

export async function getManagedKeyById(id: string, tenantId?: string | null): Promise<ManagedKey | null> {
  const row = tenantId
    ? await getDatabase().getFirst<KeyRow>(
        'SELECT * FROM managed_keys WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<KeyRow>('SELECT * FROM managed_keys WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapKey(row) : null;
}

export async function listManagedKeys(
  tenantId: string,
  input?: { siteId?: string | null; status?: ManagedKeyStatus | null },
): Promise<ManagedKey[]> {
  const rows = await getDatabase().getAll<KeyRow>(
    `SELECT * FROM managed_keys WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name`,
    [tenantId],
  );
  return rows
    .map(mapKey)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status),
    );
}

export async function updateManagedKey(
  id: string,
  tenantId: string,
  patch: Partial<Pick<ManagedKey, 'name' | 'description' | 'storageLocation' | 'keyType' | 'status' | 'qrAssetId'>>,
): Promise<ManagedKey> {
  const current = await getManagedKeyById(id, tenantId);
  if (!current) throw new Error('找不到鑰匙');
  await getDatabase().run(
    `UPDATE managed_keys SET name = ?, description = ?, storage_location = ?, key_type = ?, status = ?, qr_asset_id = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.name ?? current.name,
      patch.description === undefined ? current.description : patch.description,
      patch.storageLocation === undefined ? current.storageLocation : patch.storageLocation,
      patch.keyType ?? current.keyType,
      patch.status ?? current.status,
      patch.qrAssetId === undefined ? current.qrAssetId : patch.qrAssetId,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getManagedKeyById(id, tenantId);
  if (!updated) throw new Error('更新鑰匙失敗');
  return updated;
}

export async function insertKeyTransaction(input: {
  tenantId: string;
  siteId: string;
  keyId: string;
  transactionType: KeyTransactionType;
  borrowerType: LoanBorrowerType;
  borrowerUserId?: string | null;
  borrowerResidentId?: string | null;
  borrowerNameSnapshot: string;
  purpose?: string | null;
  checkedOutAt?: string | null;
  dueAt?: string | null;
  returnedAt?: string | null;
  conditionOut?: string | null;
  conditionIn?: string | null;
  processedBy: string | null;
  note?: string | null;
  compensationReviewRequired?: boolean;
  correctsId?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<KeyTransaction> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO key_transactions (
      id, tenant_id, site_id, key_id, transaction_type, borrower_type, borrower_user_id, borrower_resident_id,
      borrower_name_snapshot, purpose, checked_out_at, due_at, returned_at, condition_out, condition_in,
      processed_by, note, compensation_review_required, corrects_id,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.keyId,
      input.transactionType,
      input.borrowerType,
      input.borrowerUserId ?? null,
      input.borrowerResidentId ?? null,
      input.borrowerNameSnapshot,
      input.purpose ?? null,
      input.checkedOutAt ?? null,
      input.dueAt ?? null,
      input.returnedAt ?? null,
      input.conditionOut ?? null,
      input.conditionIn ?? null,
      input.processedBy,
      input.note ?? null,
      sqlBool(input.compensationReviewRequired ?? false),
      input.correctsId ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<TxRow>(
    'SELECT * FROM key_transactions WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入鑰匙紀錄失敗');
  return mapTx(row);
}

export async function listKeyTransactions(tenantId: string, keyId?: string | null): Promise<KeyTransaction[]> {
  const rows = await getDatabase().getAll<TxRow>(
    `SELECT * FROM key_transactions WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows.map(mapTx).filter((item) => !keyId || item.keyId === keyId);
}

export async function getKeyTransactionById(id: string, tenantId?: string | null): Promise<KeyTransaction | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TxRow>('SELECT * FROM key_transactions WHERE id = ? AND tenant_id = ?', [id, tenantId])
    : await getDatabase().getFirst<TxRow>('SELECT * FROM key_transactions WHERE id = ?', [id]);
  return row ? mapTx(row) : null;
}
