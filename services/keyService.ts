import { KEY_TRANSACTION_TYPE_LABELS, type LoanBorrowerType, type ManagedKeyType } from '@/constants/mobility';
import { getDatabase } from '@/database/runtime';
import { insertNotification } from '@/repositories/notificationRepository';
import { getManagedKeyById, insertKeyTransaction, insertManagedKey, listKeyTransactions, listManagedKeys, updateManagedKey } from '@/repositories/keyRepository';
import { listUsersByTenant } from '@/repositories/userRepository';
import type { KeyTransaction, ManagedKey } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireCommunitySiteRecord, requireManagedKeyInTenant, requireResidentInTenant } from './communityAccess';
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

async function notifyKeyManagers(tenantId: string, siteId: string, title: string, body: string, relatedId: string) {
  const users = await listUsersByTenant(tenantId);
  for (const user of users) {
    const keys = await getEffectivePermissionKeys(user);
    if (!keys.includes('key.manage') && !keys.includes('mobilityDashboard.view')) continue;
    const sites = await getAuthorizedSites(user);
    if (!sites.some((site) => site.id === siteId)) continue;
    await insertNotification({ tenantId, userId: user.id, title, body, kind: 'key_overdue', relatedId });
  }
}

export function openKeyCheckout(transactions: KeyTransaction[]): KeyTransaction | null {
  const voided = new Set(
    transactions.filter((item) => item.transactionType === 'correction' && item.correctsId).map((item) => item.correctsId as string),
  );
  const checkouts = transactions.filter((item) => item.transactionType === 'checkout' && !voided.has(item.id));
  const returns = new Set(
    transactions.filter((item) => item.transactionType === 'return' && item.correctsId).map((item) => item.correctsId as string),
  );
  const open = [...checkouts].reverse().find((item) => !returns.has(item.id));
  return open ?? null;
}

export async function createManagedKeyForActor(
  actor: ActorContext,
  input: {
    siteId: string;
    keyCode: string;
    name: string;
    description?: string | null;
    storageLocation?: string | null;
    keyType?: ManagedKeyType;
  },
): Promise<ManagedKey> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.manage');
  const site = await requireSiteInTenant(input.siteId, tenantId);
  await requireActorSiteAccess(actor, site.id);
  const codeError = required(input.keyCode, '鑰匙代碼');
  const nameError = required(input.name, '鑰匙名稱');
  if (codeError || nameError) throw new Error(codeError ?? nameError ?? '資料不完整');
  const key = await uniqueOrThrow(
    () =>
      insertManagedKey({
        tenantId,
        siteId: site.id,
        keyCode: input.keyCode.trim(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        storageLocation: input.storageLocation?.trim() || null,
        keyType: input.keyType,
        createdBy: actor.userId,
        deviceId: actor.deviceId,
      }),
    '此鑰匙代碼已存在',
  );
  await writeAudit({
    actor,
    action: 'create',
    module: 'key',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」建立鑰匙「${key.name}」。`,
    targetType: 'managed_key',
    targetId: key.id,
    targetDisplayName: key.name,
    after: key,
    siteId: site.id,
  });
  try {
    const qr = await issueKeyItemQr(actor, { targetId: key.id, targetType: 'managed_key' });
    return attachKeyQr(actor, key.id, qr.id);
  } catch {
    return key;
  }
}

export async function listManagedKeysForActor(actor: ActorContext, siteId?: string | null): Promise<ManagedKey[]> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.view');
  if (siteId) await requireActorSiteAccess(actor, siteId);
  const rows = await listManagedKeys(tenantId, { siteId });
  const visible: ManagedKey[] = [];
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

export async function getManagedKeyForActor(
  actor: ActorContext,
  id: string,
): Promise<{ key: ManagedKey; transactions: KeyTransaction[]; currentCheckout: KeyTransaction | null }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.view');
  const key = await requireCommunitySiteRecord(actor, await requireManagedKeyInTenant(id, tenantId));
  const transactions = await listKeyTransactions(tenantId, key.id);
  return { key, transactions, currentCheckout: openKeyCheckout(transactions) };
}

export async function checkoutKeyForActor(
  actor: ActorContext,
  input: {
    keyId: string;
    borrowerType: LoanBorrowerType;
    borrowerName: string;
    borrowerUserId?: string | null;
    borrowerResidentId?: string | null;
    purpose?: string | null;
    dueAt?: string | null;
    conditionOut?: string | null;
    note?: string | null;
  },
): Promise<{ key: ManagedKey; transaction: KeyTransaction }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.checkout');
  const key = await requireManagedKeyInTenant(input.keyId, tenantId);
  await requireActorSiteAccess(actor, key.siteId);
  if (key.status === 'checked_out') {
    const txs = await listKeyTransactions(tenantId, key.id);
    const open = openKeyCheckout(txs);
    throw new Error(
      `此鑰匙目前已借出：${open?.borrowerNameSnapshot ?? '借用人'}，借出時間 ${open?.checkedOutAt ? formatDateTimeZh(open.checkedOutAt) : '—'}，預計歸還 ${open?.dueAt ? formatDateTimeZh(open.dueAt) : '未設定'}`,
    );
  }
  if (key.status !== 'available') throw new Error('此鑰匙目前不可借出');
  const nameError = required(input.borrowerName, '借用人姓名');
  if (nameError) throw new Error(nameError);
  if (input.borrowerResidentId) await requireResidentInTenant(input.borrowerResidentId, tenantId);
  const at = nowIso();
  return getDatabase().withTransaction(async () => {
    const fresh = await requireManagedKeyInTenant(input.keyId, tenantId);
    if (fresh.status === 'checked_out') {
      const txs = await listKeyTransactions(tenantId, fresh.id);
      const open = openKeyCheckout(txs);
      throw new Error(
        `此鑰匙目前已借出：${open?.borrowerNameSnapshot ?? '借用人'}，借出時間 ${open?.checkedOutAt ? formatDateTimeZh(open.checkedOutAt) : '—'}，預計歸還 ${open?.dueAt ? formatDateTimeZh(open.dueAt) : '未設定'}`,
      );
    }
    if (fresh.status !== 'available') throw new Error('此鑰匙目前不可借出');
    const transaction = await insertKeyTransaction({
      tenantId,
      siteId: key.siteId,
      keyId: key.id,
      transactionType: 'checkout',
      borrowerType: input.borrowerType,
      borrowerUserId: input.borrowerUserId ?? actor.userId,
      borrowerResidentId: input.borrowerResidentId,
      borrowerNameSnapshot: input.borrowerName.trim(),
      purpose: input.purpose?.trim() || null,
      checkedOutAt: at,
      dueAt: input.dueAt ?? null,
      conditionOut: input.conditionOut?.trim() || null,
      processedBy: actor.userId,
      note: input.note?.trim() || null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const updated = await updateManagedKey(key.id, tenantId, { status: 'checked_out' });
    const site = await requireSiteInTenant(key.siteId, tenantId);
    await writeAudit({
      actor,
      action: 'checkout',
      module: 'key',
      description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」借出鑰匙「${key.name}」給「${transaction.borrowerNameSnapshot}」。`,
      targetType: 'key_transaction',
      targetId: transaction.id,
      targetDisplayName: key.name,
      after: { key: updated, transaction },
      siteId: site.id,
    });
    return { key: updated, transaction };
  });
}

export async function returnKeyForActor(
  actor: ActorContext,
  input: { keyId: string; conditionIn?: string | null; note?: string | null },
): Promise<{ key: ManagedKey; transaction: KeyTransaction }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.return');
  const key = await requireManagedKeyInTenant(input.keyId, tenantId);
  await requireActorSiteAccess(actor, key.siteId);
  if (key.status !== 'checked_out') throw new Error('此鑰匙目前不是借出狀態');
  const txs = await listKeyTransactions(tenantId, key.id);
  const open = openKeyCheckout(txs);
  const at = nowIso();
  return getDatabase().withTransaction(async () => {
    const transaction = await insertKeyTransaction({
      tenantId,
      siteId: key.siteId,
      keyId: key.id,
      transactionType: 'return',
      borrowerType: open?.borrowerType ?? 'staff',
      borrowerUserId: open?.borrowerUserId ?? null,
      borrowerResidentId: open?.borrowerResidentId ?? null,
      borrowerNameSnapshot: open?.borrowerNameSnapshot ?? actor.fullName,
      returnedAt: at,
      conditionIn: input.conditionIn?.trim() || null,
      processedBy: actor.userId,
      note: input.note?.trim() || null,
      correctsId: open?.id ?? null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const updated = await updateManagedKey(key.id, tenantId, { status: 'available' });
    const site = await requireSiteInTenant(key.siteId, tenantId);
    await writeAudit({
      actor,
      action: 'return',
      module: 'key',
      description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」歸還鑰匙「${key.name}」。`,
      targetType: 'key_transaction',
      targetId: transaction.id,
      after: { key: updated, transaction },
      siteId: site.id,
    });
    return { key: updated, transaction };
  });
}

export async function reportKeyIssueForActor(
  actor: ActorContext,
  input: { keyId: string; type: 'lost' | 'damaged'; note?: string | null; borrowerName?: string | null },
): Promise<{ key: ManagedKey; transaction: KeyTransaction }> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.manage');
  const key = await requireManagedKeyInTenant(input.keyId, tenantId);
  await requireActorSiteAccess(actor, key.siteId);
  const txs = await listKeyTransactions(tenantId, key.id);
  const open = openKeyCheckout(txs);
  const at = nowIso();
  return getDatabase().withTransaction(async () => {
    const transaction = await insertKeyTransaction({
      tenantId,
      siteId: key.siteId,
      keyId: key.id,
      transactionType: input.type,
      borrowerType: open?.borrowerType ?? 'other',
      borrowerUserId: open?.borrowerUserId ?? null,
      borrowerResidentId: open?.borrowerResidentId ?? null,
      borrowerNameSnapshot: input.borrowerName?.trim() || open?.borrowerNameSnapshot || actor.fullName,
      processedBy: actor.userId,
      note: input.note?.trim() || null,
      compensationReviewRequired: true,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
    const updated = await updateManagedKey(key.id, tenantId, { status: input.type });
    const site = await requireSiteInTenant(key.siteId, tenantId);
    await writeAudit({
      actor,
      action: input.type,
      module: 'key',
      description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${site.name}」登記鑰匙「${key.name}」${KEY_TRANSACTION_TYPE_LABELS[input.type]}，需主管審核賠償，原因：${input.note?.trim() || '未填'}。`,
      targetType: 'key_transaction',
      targetId: transaction.id,
      after: { key: updated, transaction },
      siteId: site.id,
    });
    return { key: updated, transaction };
  });
}

export async function listOverdueKeysForActor(actor: ActorContext, siteId: string, at: Date = new Date()): Promise<Array<{ key: ManagedKey; checkout: KeyTransaction }>> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.view');
  await requireActorSiteAccess(actor, siteId);
  const keys = await listManagedKeys(tenantId, { siteId, status: 'checked_out' });
  const overdue: Array<{ key: ManagedKey; checkout: KeyTransaction }> = [];
  for (const key of keys) {
    const txs = await listKeyTransactions(tenantId, key.id);
    const open = openKeyCheckout(txs);
    if (open?.dueAt && new Date(open.dueAt).getTime() < at.getTime()) {
      overdue.push({ key, checkout: open });
    }
  }
  return overdue;
}

export async function notifyOverdueKeysForSite(actor: ActorContext, siteId: string, at: Date = new Date()): Promise<number> {
  const overdue = await listOverdueKeysForActor(actor, siteId, at);
  const tenantId = requireActorTenant(actor);
  for (const row of overdue) {
    await notifyKeyManagers(
      tenantId,
      siteId,
      '鑰匙逾期未還',
      `鑰匙「${row.key.name}」由「${row.checkout.borrowerNameSnapshot}」逾期未還`,
      row.key.id,
    );
  }
  return overdue.length;
}

export async function updateManagedKeyForActor(
  actor: ActorContext,
  id: string,
  patch: Partial<Pick<ManagedKey, 'name' | 'description' | 'storageLocation' | 'keyType' | 'status'>>,
): Promise<ManagedKey> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.manage');
  const current = await requireManagedKeyInTenant(id, tenantId);
  await requireActorSiteAccess(actor, current.siteId);
  const updated = await updateManagedKey(id, tenantId, patch);
  const site = await requireSiteInTenant(current.siteId, tenantId);
  await writeAudit({
    actor,
    action: 'update',
    module: 'key',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 在「${site.name}」更新鑰匙「${updated.name}」。`,
    targetType: 'managed_key',
    targetId: updated.id,
    before: current,
    after: updated,
    siteId: site.id,
  });
  return updated;
}

export async function attachKeyQr(actor: ActorContext, keyId: string, qrAssetId: string): Promise<ManagedKey> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'key.manage');
  const key = await requireManagedKeyInTenant(keyId, tenantId);
  await requireActorSiteAccess(actor, key.siteId);
  return updateManagedKey(key.id, tenantId, { qrAssetId });
}

export { getManagedKeyById };
