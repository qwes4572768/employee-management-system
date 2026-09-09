import { ITEM_LOAN_TRANSACTION_TYPE_LABELS, type LoanBorrowerType } from '@/constants/mobility';
import { getDatabase } from '@/database/runtime';
import { insertNotification } from '@/repositories/notificationRepository';
import {
  getItemLoanTransactionById,
  insertItemLoanTransaction,
  insertLoanItem,
  listItemLoanTransactions,
  listLoanItems,
  updateLoanItem,
} from '@/repositories/loanItemRepository';
import { listUsersByTenant } from '@/repositories/userRepository';
import type { ItemLoanTransaction, LoanItem } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireCommunitySiteRecord, requireLoanItemInTenant, requireResidentInTenant } from './communityAccess';
import { requireActorSiteAccess } from './patrolAccess';
import { getEffectivePermissionKeys } from './permissionService';
import { getAuthorizedSites } from './siteService';
import { requireActorTenant, requireSiteInTenant } from './tenantGuard';
import { issueKeyItemQr } from './qrAssetService';

async function uniqueOrThrow<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) throw new Error(message);
    throw error;
  }
}

async function notifyLoanManagers(tenantId: string, siteId: string, title: string, body: string, relatedId: string) {
  const users = await listUsersByTenant(tenantId);
  for (const user of users) {
    const keys = await getEffectivePermissionKeys(user);
    if (!keys.includes('loanItem.manage') && !keys.includes('mobilityDashboard.view')) continue;
    const sites = await getAuthorizedSites(user);
    if (!sites.some((site) => site.id === siteId)) continue;
    await insertNotification({ tenantId, userId: user.id, title, body, kind: 'item_overdue', relatedId });
  }
}

export function outstandingForBorrow(transactions: ItemLoanTransaction[], borrowId: string): number {
  const borrow = transactions.find((item) => item.id === borrowId && item.transactionType === 'borrow');
  if (!borrow) return 0;
  const returned = transactions
    .filter((item) => item.transactionType === 'return' && item.relatedTransactionId === borrowId)
    .reduce((sum, item) => sum + item.quantity, 0);
  const lost = transactions
    .filter((item) => (item.transactionType === 'lost' || item.transactionType === 'damaged') && item.relatedTransactionId === borrowId)
    .reduce((sum, item) => sum + item.quantity, 0);
  return Math.max(0, borrow.quantity - returned - lost);
}

export async function createLoanItemForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    itemCode: string;
    name: string;
    category?: string | null;
    totalQuantity: number;
    storageLocation?: string | null;
    requiresDeposit?: boolean;
    depositReferenceAmount?: number | null;
    notes?: string | null;
  },
): Promise<LoanItem> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const codeError = required(input.itemCode, '物品代碼');
  const nameError = required(input.name, '物品名稱');
  if (codeError || nameError) throw new Error(codeError ?? nameError ?? '資料不完整');
  if (input.totalQuantity < 0) throw new Error('數量不可為負');
  const item = await uniqueOrThrow(
    () =>
      insertLoanItem({
        tenantId,
        siteId: site.id,
        itemCode: input.itemCode.trim(),
        name: input.name.trim(),
        category: input.category?.trim() || null,
        totalQuantity: input.totalQuantity,
        storageLocation: input.storageLocation?.trim() || null,
        requiresDeposit: input.requiresDeposit,
        depositReferenceAmount: input.depositReferenceAmount ?? null,
        notes: input.notes?.trim() || null,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      }),
    '此物品代碼已存在',
  );
  await writeAudit({
    actor,
    action: 'create',
    module: 'loanItem',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」建立公共物品「${item.name}」，數量 ${item.totalQuantity}。`,
    targetType: 'loan_item',
    targetId: item.id,
    targetDisplayName: item.name,
    after: item,
    siteId: site.id,
  });
  try {
    const qr = await issueKeyItemQr(actor, { targetId: item.id, targetType: 'loan_item' });
    return attachLoanItemQr(actor, item.id, qr.id);
  } catch {
    return item;
  }
}

export async function listLoanItemsForActor(actor: ActorContext, siteId?: string | null): Promise<LoanItem[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.view');
  if (siteId) await requireActorSiteAccess(actor, siteId);
  const rows = await listLoanItems(tenantId, { siteId });
  const visible: LoanItem[] = [];
  for (const row of rows) {
    try {
      await requireActorSiteAccess(actor, row.siteId);
      visible.push(row);
    } catch {
      continue;
    }
  }
  return visible;
}

export async function getLoanItemForActor(
  actor: ActorContext,
  id: string,
): Promise<{ item: LoanItem; transactions: ItemLoanTransaction[] }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.view');
  const item = await requireCommunitySiteRecord(actor, await requireLoanItemInTenant(id, tenantId));
  return { item, transactions: await listItemLoanTransactions(tenantId, item.id) };
}

export async function borrowLoanItemForActor(
  actor: ActorContext,
  input: {
    itemId: string;
    quantity: number;
    borrowerType: LoanBorrowerType;
    borrowerName: string;
    borrowerUserId?: string | null;
    borrowerResidentId?: string | null;
    purpose?: string | null;
    dueAt?: string | null;
    conditionOut?: string | null;
    photoUri?: string | null;
    note?: string | null;
  },
): Promise<{ item: LoanItem; transaction: ItemLoanTransaction }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.borrow');
  const item = await requireLoanItemInTenant(input.itemId, tenantId);
  await requireActorSiteAccess(actor, item.siteId);
  if (item.status !== 'active') throw new Error('此物品目前不可借用');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('借用數量必須為正整數');
  if (input.quantity > item.availableQuantity) {
    throw new Error(`目前可借 ${item.availableQuantity} 件`);
  }
  const nameError = required(input.borrowerName, '借用人姓名');
  if (nameError) throw new Error(nameError);
  if (input.borrowerResidentId) await requireResidentInTenant(input.borrowerResidentId, tenantId);
  const at = nowIso();
  return getDatabase().withTransaction(async () => {
    const fresh = await requireLoanItemInTenant(item.id, tenantId);
    if (input.quantity > fresh.availableQuantity) {
      throw new Error(`目前可借 ${fresh.availableQuantity} 件`);
    }
    const transaction = await insertItemLoanTransaction({
      tenantId,
      siteId: item.siteId,
      itemId: item.id,
      transactionType: 'borrow',
      quantity: input.quantity,
      borrowerType: input.borrowerType,
      borrowerUserId: input.borrowerUserId ?? actor.userId,
      borrowerResidentId: input.borrowerResidentId,
      borrowerNameSnapshot: input.borrowerName.trim(),
      purpose: input.purpose?.trim() || null,
      borrowedAt: at,
      dueAt: input.dueAt ?? null,
      conditionOut: input.conditionOut?.trim() || null,
      processedBy: actor.userId,
      photoUri: input.photoUri,
      note: input.note?.trim() || null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const updated = await updateLoanItem(item.id, tenantId, {
      availableQuantity: fresh.availableQuantity - input.quantity,
    });
    const site = await requireSiteInTenant(item.siteId, tenantId);
    await writeAudit({
      actor,
      action: 'borrow',
      module: 'loanItem',
      description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」借出「${item.name}」${input.quantity} 件給「${transaction.borrowerNameSnapshot}」。`,
      targetType: 'item_loan_transaction',
      targetId: transaction.id,
      after: { item: updated, transaction },
      siteId: site.id,
    });
    return { item: updated, transaction };
  });
}

export async function returnLoanItemForActor(
  actor: ActorContext,
  input: {
    itemId: string;
    borrowTransactionId: string;
    quantity: number;
    conditionIn?: string | null;
    photoUri?: string | null;
    note?: string | null;
  },
): Promise<{ item: LoanItem; transaction: ItemLoanTransaction }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.return');
  const item = await requireLoanItemInTenant(input.itemId, tenantId);
  await requireActorSiteAccess(actor, item.siteId);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('歸還數量必須為正整數');
  const txs = await listItemLoanTransactions(tenantId, item.id);
  const outstanding = outstandingForBorrow(txs, input.borrowTransactionId);
  if (input.quantity > outstanding) throw new Error(`此筆借用尚餘 ${outstanding} 件未還`);
  const at = nowIso();
  return getDatabase().withTransaction(async () => {
    const latest = await listItemLoanTransactions(tenantId, item.id);
    const remainNow = outstandingForBorrow(latest, input.borrowTransactionId);
    if (input.quantity > remainNow) throw new Error(`此筆借用尚餘 ${remainNow} 件未還`);
    const fresh = await requireLoanItemInTenant(item.id, tenantId);
    const transaction = await insertItemLoanTransaction({
      tenantId,
      siteId: item.siteId,
      itemId: item.id,
      transactionType: 'return',
      quantity: input.quantity,
      borrowerType: txs.find((row) => row.id === input.borrowTransactionId)?.borrowerType ?? 'other',
      borrowerUserId: txs.find((row) => row.id === input.borrowTransactionId)?.borrowerUserId ?? null,
      borrowerResidentId: txs.find((row) => row.id === input.borrowTransactionId)?.borrowerResidentId ?? null,
      borrowerNameSnapshot: txs.find((row) => row.id === input.borrowTransactionId)?.borrowerNameSnapshot ?? actor.fullName,
      returnedAt: at,
      conditionIn: input.conditionIn?.trim() || null,
      processedBy: actor.userId,
      photoUri: input.photoUri,
      note: input.note?.trim() || null,
      relatedTransactionId: input.borrowTransactionId,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const updated = await updateLoanItem(item.id, tenantId, {
      availableQuantity: Math.min(fresh.totalQuantity, fresh.availableQuantity + input.quantity),
    });
    const site = await requireSiteInTenant(item.siteId, tenantId);
    const remain = remainNow - input.quantity;
    await writeAudit({
      actor,
      action: remain > 0 ? 'partial_return' : 'return',
      module: 'loanItem',
      description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」歸還「${item.name}」${input.quantity} 件${remain > 0 ? `（尚餘 ${remain} 件）` : '（已全數歸還）'}。`,
      targetType: 'item_loan_transaction',
      targetId: transaction.id,
      after: { item: updated, transaction },
      siteId: site.id,
    });
    return { item: updated, transaction };
  });
}

export async function reportLoanItemIssueForActor(
  actor: ActorContext,
  input: {
    itemId: string;
    borrowTransactionId?: string | null;
    type: 'lost' | 'damaged';
    quantity: number;
    note?: string | null;
    photoUri?: string | null;
  },
): Promise<{ item: LoanItem; transaction: ItemLoanTransaction }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.manage');
  const item = await requireLoanItemInTenant(input.itemId, tenantId);
  await requireActorSiteAccess(actor, item.siteId);
  const txs = await listItemLoanTransactions(tenantId, item.id);
  const borrow = input.borrowTransactionId ? txs.find((row) => row.id === input.borrowTransactionId) : null;
  const at = nowIso();
  return getDatabase().withTransaction(async () => {
    const transaction = await insertItemLoanTransaction({
      tenantId,
      siteId: item.siteId,
      itemId: item.id,
      transactionType: input.type,
      quantity: input.quantity,
      borrowerType: borrow?.borrowerType ?? 'other',
      borrowerUserId: borrow?.borrowerUserId ?? null,
      borrowerResidentId: borrow?.borrowerResidentId ?? null,
      borrowerNameSnapshot: borrow?.borrowerNameSnapshot ?? actor.fullName,
      processedBy: actor.userId,
      photoUri: input.photoUri,
      note: input.note?.trim() || null,
      relatedTransactionId: input.borrowTransactionId ?? null,
      compensationReviewRequired: true,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const site = await requireSiteInTenant(item.siteId, tenantId);
    await writeAudit({
      actor,
      action: input.type,
      module: 'loanItem',
      description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」登記「${item.name}」${ITEM_LOAN_TRANSACTION_TYPE_LABELS[input.type]} ${input.quantity} 件，需主管審核賠償，原因：${input.note?.trim() || '未填'}。`,
      targetType: 'item_loan_transaction',
      targetId: transaction.id,
      after: transaction,
      siteId: site.id,
    });
    return { item, transaction };
  });
}

export async function listOverdueItemLoansForActor(
  actor: ActorContext,
  siteId: string,
  at: Date = new Date(),
): Promise<Array<{ item: LoanItem; borrow: ItemLoanTransaction; outstanding: number }>> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.view');
  await requireActorSiteAccess(actor, siteId);
  const items = await listLoanItems(tenantId, { siteId });
  const overdue: Array<{ item: LoanItem; borrow: ItemLoanTransaction; outstanding: number }> = [];
  for (const item of items) {
    const txs = await listItemLoanTransactions(tenantId, item.id);
    for (const borrow of txs.filter((row) => row.transactionType === 'borrow')) {
      if (!borrow.dueAt || new Date(borrow.dueAt).getTime() >= at.getTime()) continue;
      const outstanding = outstandingForBorrow(txs, borrow.id);
      if (outstanding > 0) overdue.push({ item, borrow, outstanding });
    }
  }
  return overdue;
}

export async function notifyOverdueItemsForSite(actor: ActorContext, siteId: string, at: Date = new Date()): Promise<number> {
  const overdue = await listOverdueItemLoansForActor(actor, siteId, at);
  const tenantId = requireActorTenant(actor);
  for (const row of overdue) {
    await notifyLoanManagers(
      tenantId,
      siteId,
      '物品逾期未還',
      `「${row.item.name}」由「${row.borrow.borrowerNameSnapshot}」尚餘 ${row.outstanding} 件逾期未還`,
      row.item.id,
    );
  }
  return overdue.length;
}

export async function updateLoanItemForActor(
  actor: ActorContext,
  id: string,
  patch: Partial<Pick<LoanItem, 'name' | 'category' | 'storageLocation' | 'status' | 'notes' | 'requiresDeposit' | 'depositReferenceAmount'>>,
): Promise<LoanItem> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.manage');
  const current = await requireLoanItemInTenant(id, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const updated = await updateLoanItem(id, tenantId, patch);
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'loanItem',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新物品「${updated.name}」。`,
    targetType: 'loan_item',
    targetId: updated.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function attachLoanItemQr(actor: ActorContext, itemId: string, qrAssetId: string): Promise<LoanItem> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'loanItem.manage');
  const item = await requireLoanItemInTenant(itemId, tenantId);
  await requireActorSiteAccess(actor, item.siteId);
  return updateLoanItem(item.id, tenantId, { qrAssetId });
}

export { getItemLoanTransactionById };
