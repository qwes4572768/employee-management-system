import { getDatabase } from '@/database/runtime';
import { requireActorPermission, requireCanManageUser, requirePermanentAdministrator } from './access';
import { listUsersByStatus, listUsersByTenant, getUserById, updateUserStatus } from '@/repositories/userRepository';
import { listUserRoles } from '@/repositories/permissionRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import type { User, UserStatus } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { requireActorTenant, requireUserInTenant } from './tenantGuard';

export async function listAccounts(tenantId: string, actor?: ActorContext): Promise<User[]> {
  if (actor) {
    const actorTenant = requireActorTenant(actor);
    if (actorTenant !== tenantId) {
      throw new Error('無權存取其他公司的資料');
    }
  }
  return listUsersByTenant(tenantId);
}

export async function listPendingAccounts(tenantId: string, actor?: ActorContext): Promise<User[]> {
  if (actor) {
    const actorTenant = requireActorTenant(actor);
    if (actorTenant !== tenantId) {
      throw new Error('無權存取其他公司的資料');
    }
  }
  return listUsersByStatus(tenantId, 'pending');
}

export async function setAccountStatus(
  actor: ActorContext,
  userId: string,
  status: Extract<UserStatus, 'active' | 'suspended'>,
): Promise<User> {
  await requireActorPermission(actor, 'users.update');
  const tenantId = requireActorTenant(actor);
  const before = await requireUserInTenant(userId, tenantId);
  if (before.status !== 'active' && before.status !== 'suspended') {
    throw new Error('待審、退回或拒絕的帳號必須由帳號審核流程開通');
  }
  await requireCanManageUser(actor, userId);
  const after = await getDatabase().withTransaction(async () => {
    const updated = await updateUserStatus(userId, status, before.reviewNote);
    await requirePermanentAdministrator(tenantId);
    return updated;
  });
  const verb = status === 'suspended' ? '停權' : '恢復';
  await writeAudit({
    actor,
    action: 'update',
    module: 'users',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${verb}員工「${after.fullName}」帳號`,
    targetType: 'user',
    targetId: after.id,
    targetDisplayName: after.fullName,
    before,
    after,
  });
  return after;
}

export async function updateStaffingMode(
  actor: ActorContext,
  userId: string,
  staffingMode: import('@/constants/staffing').StaffingMode,
) {
  const { setUserStaffingMode } = await import('./scheduleService');
  return setUserStaffingMode(actor, userId, staffingMode);
}

export { getUserById, listUserRoles, listUserSitePermissions };
