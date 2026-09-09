import { getDatabase } from '@/database/runtime';
import type { ItemLoanTransactionType, LoanBorrowerType, LoanItemStatus } from '@/constants/mobility';
import type { ItemLoanTransaction, LoanItem } from '@/types';
import { boolFromSql, sqlBool } from '@/utils/data';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';

import { mapSync, type SyncRow } from './mappers';

interface ItemRow extends SyncRow {
  id: string;
  tenant_id: string;
  site_id: string;
  item_code: string;
  name: string;
  category: string | null;
  total_quantity: number;
  available_quantity: number;
  storage_location: string | null;
  requires_deposit: number;
  deposit_reference_amount: number | null;
  status: LoanItemStatus;
  qr_asset_id: string | null;
  notes: string | null;
}

interface TxRow {
  id: string;
  tenant_id: string;
  site_id: string;
  item_id: string;
  transaction_type: ItemLoanTransactionType;
  quantity: number;
  borrower_type: LoanBorrowerType;
  borrower_user_id: string | null;
  borrower_resident_id: string | null;
  borrower_name_snapshot: string;
  purpose: string | null;
  borrowed_at: string | null;
  due_at: string | null;
  returned_at: string | null;
  condition_out: string | null;
  condition_in: string | null;
  processed_by: string | null;
  photo_uri: string | null;
  note: string | null;
  related_transaction_id: string | null;
  compensation_review_required: number;
  created_by: string | null;
  created_at: string;
  sync_status: string;
  device_id: string | null;
}

function mapItem(row: ItemRow): LoanItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    itemCode: row.item_code,
    name: row.name,
    category: row.category,
    totalQuantity: row.total_quantity,
    availableQuantity: row.available_quantity,
    storageLocation: row.storage_location,
    requiresDeposit: boolFromSql(row.requires_deposit),
    depositReferenceAmount: row.deposit_reference_amount,
    status: row.status,
    qrAssetId: row.qr_asset_id,
    notes: row.notes,
    ...mapSync(row),
  };
}

function mapTx(row: TxRow): ItemLoanTransaction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    itemId: row.item_id,
    transactionType: row.transaction_type,
    quantity: row.quantity,
    borrowerType: row.borrower_type,
    borrowerUserId: row.borrower_user_id,
    borrowerResidentId: row.borrower_resident_id,
    borrowerNameSnapshot: row.borrower_name_snapshot,
    purpose: row.purpose,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    conditionOut: row.condition_out,
    conditionIn: row.condition_in,
    processedBy: row.processed_by,
    photoUri: row.photo_uri,
    note: row.note,
    relatedTransactionId: row.related_transaction_id,
    compensationReviewRequired: boolFromSql(row.compensation_review_required),
    createdAt: row.created_at,
    createdBy: row.created_by,
    syncStatus: row.sync_status,
    deviceId: row.device_id,
  };
}

export async function insertLoanItem(input: {
  tenantId: string;
  siteId: string;
  itemCode: string;
  name: string;
  category?: string | null;
  totalQuantity: number;
  storageLocation?: string | null;
  requiresDeposit?: boolean;
  depositReferenceAmount?: number | null;
  notes?: string | null;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<LoanItem> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO loan_items (
      id, tenant_id, site_id, item_code, name, category, total_quantity, available_quantity, storage_location,
      requires_deposit, deposit_reference_amount, status, qr_asset_id, notes,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.itemCode,
      input.name,
      input.category ?? null,
      input.totalQuantity,
      input.totalQuantity,
      input.storageLocation ?? null,
      sqlBool(input.requiresDeposit ?? false),
      input.depositReferenceAmount ?? null,
      input.notes ?? null,
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const created = await getLoanItemById(id, input.tenantId);
  if (!created) throw new Error('建立物品失敗');
  return created;
}

export async function getLoanItemById(id: string, tenantId?: string | null): Promise<LoanItem | null> {
  const row = tenantId
    ? await getDatabase().getFirst<ItemRow>(
        'SELECT * FROM loan_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<ItemRow>('SELECT * FROM loan_items WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? mapItem(row) : null;
}

export async function listLoanItems(
  tenantId: string,
  input?: { siteId?: string | null; status?: LoanItemStatus | null },
): Promise<LoanItem[]> {
  const rows = await getDatabase().getAll<ItemRow>(
    `SELECT * FROM loan_items WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name`,
    [tenantId],
  );
  return rows
    .map(mapItem)
    .filter(
      (item) =>
        (!input?.siteId || item.siteId === input.siteId) && (!input?.status || item.status === input.status),
    );
}

export async function updateLoanItem(
  id: string,
  tenantId: string,
  patch: Partial<Pick<LoanItem, 'name' | 'category' | 'totalQuantity' | 'availableQuantity' | 'storageLocation' | 'requiresDeposit' | 'depositReferenceAmount' | 'status' | 'qrAssetId' | 'notes'>>,
): Promise<LoanItem> {
  const current = await getLoanItemById(id, tenantId);
  if (!current) throw new Error('找不到物品');
  await getDatabase().run(
    `UPDATE loan_items SET name = ?, category = ?, total_quantity = ?, available_quantity = ?, storage_location = ?,
      requires_deposit = ?, deposit_reference_amount = ?, status = ?, qr_asset_id = ?, notes = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ? AND tenant_id = ?`,
    [
      patch.name ?? current.name,
      patch.category === undefined ? current.category : patch.category,
      patch.totalQuantity ?? current.totalQuantity,
      patch.availableQuantity ?? current.availableQuantity,
      patch.storageLocation === undefined ? current.storageLocation : patch.storageLocation,
      sqlBool(patch.requiresDeposit ?? current.requiresDeposit),
      patch.depositReferenceAmount === undefined ? current.depositReferenceAmount : patch.depositReferenceAmount,
      patch.status ?? current.status,
      patch.qrAssetId === undefined ? current.qrAssetId : patch.qrAssetId,
      patch.notes === undefined ? current.notes : patch.notes,
      nowIso(),
      id,
      tenantId,
    ],
  );
  const updated = await getLoanItemById(id, tenantId);
  if (!updated) throw new Error('更新物品失敗');
  return updated;
}

export async function insertItemLoanTransaction(input: {
  tenantId: string;
  siteId: string;
  itemId: string;
  transactionType: ItemLoanTransactionType;
  quantity: number;
  borrowerType: LoanBorrowerType;
  borrowerUserId?: string | null;
  borrowerResidentId?: string | null;
  borrowerNameSnapshot: string;
  purpose?: string | null;
  borrowedAt?: string | null;
  dueAt?: string | null;
  returnedAt?: string | null;
  conditionOut?: string | null;
  conditionIn?: string | null;
  processedBy: string | null;
  photoUri?: string | null;
  note?: string | null;
  relatedTransactionId?: string | null;
  compensationReviewRequired?: boolean;
  createdBy: string | null;
  deviceId: string | null;
}): Promise<ItemLoanTransaction> {
  const id = createId();
  const ts = nowIso();
  await getDatabase().run(
    `INSERT INTO item_loan_transactions (
      id, tenant_id, site_id, item_id, transaction_type, quantity, borrower_type, borrower_user_id, borrower_resident_id,
      borrower_name_snapshot, purpose, borrowed_at, due_at, returned_at, condition_out, condition_in,
      processed_by, photo_uri, note, related_transaction_id, compensation_review_required,
      created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 'local', ?)`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.itemId,
      input.transactionType,
      input.quantity,
      input.borrowerType,
      input.borrowerUserId ?? null,
      input.borrowerResidentId ?? null,
      input.borrowerNameSnapshot,
      input.purpose ?? null,
      input.borrowedAt ?? null,
      input.dueAt ?? null,
      input.returnedAt ?? null,
      input.conditionOut ?? null,
      input.conditionIn ?? null,
      input.processedBy,
      input.photoUri ?? null,
      input.note ?? null,
      input.relatedTransactionId ?? null,
      sqlBool(input.compensationReviewRequired ?? false),
      input.createdBy,
      ts,
      ts,
      input.deviceId,
    ],
  );
  const row = await getDatabase().getFirst<TxRow>(
    'SELECT * FROM item_loan_transactions WHERE id = ? AND tenant_id = ?',
    [id, input.tenantId],
  );
  if (!row) throw new Error('寫入借用紀錄失敗');
  return mapTx(row);
}

export async function listItemLoanTransactions(tenantId: string, itemId?: string | null): Promise<ItemLoanTransaction[]> {
  const rows = await getDatabase().getAll<TxRow>(
    `SELECT * FROM item_loan_transactions WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows.map(mapTx).filter((item) => !itemId || item.itemId === itemId);
}

export async function getItemLoanTransactionById(id: string, tenantId?: string | null): Promise<ItemLoanTransaction | null> {
  const row = tenantId
    ? await getDatabase().getFirst<TxRow>(
        'SELECT * FROM item_loan_transactions WHERE id = ? AND tenant_id = ?',
        [id, tenantId],
      )
    : await getDatabase().getFirst<TxRow>('SELECT * FROM item_loan_transactions WHERE id = ?', [id]);
  return row ? mapTx(row) : null;
}
