import { listUsersByStatus, listUsersByTenant, getUserById, updateUserStatus } from '@/repositories/userRepository';
import { listUserRoles } from '@/repositories/permissionRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import type { User, UserStatus } from '@/types';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';

export async function listAccounts(tenantId: string): Promise<User[]> {
  return listUsersByTenant(tenantId);
}

export async function listPendingAccounts(tenantId: string): Promise<User[]> {
  return listUsersByStatus(tenantId, 'pending');
}

export async function setAccountStatus(
  actor: ActorContext,
  userId: string,
  status: Extract<UserStatus, 'active' | 'suspended'>,
): Promise<User> {
  const before = await getUserById(userId);
  if (!before) {
    throw new Error('找不到帳號');
  }
  const after = await updateUserStatus(userId, status, before.reviewNote);
  const verb = status === 'suspended' ? '停權' : '恢復';
  await writeAudit({
    actor,
    action: 'update',
    module: 'users',
    description: `${actor.fullName} ${verb}員工「${after.fullName}」帳號`,
    targetType: 'user',
    targetId: after.id,
    targetDisplayName: after.fullName,
    before,
    after,
  });
  return after;
}

export { getUserById, listUserRoles, listUserSitePermissions };
