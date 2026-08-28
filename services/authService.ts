import { countTenants } from '@/repositories/tenantRepository';
import {
  findAccountGlobally,
  getUserByAccount,
  getUserById,
  getUserSecret,
  insertUser,
  updateUserPassword,
  updateUserProfile,
  updateUserStatus,
} from '@/repositories/userRepository';
import type { Gender, Tenant, User, UserStatus } from '@/types';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/utils/password';
import {
  firstError,
  required,
  validateAccount,
  validateEmployeeNo,
  validatePhone,
} from '@/utils/validation';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { roleSnapshotForUser } from './permissionService';
import { clearSession, createSession, saveSession } from './sessionStore';

export async function isBootstrapComplete(): Promise<boolean> {
  return (await countTenants()) > 0;
}

export async function login(account: string, password: string, actor: ActorContext): Promise<User> {
  const user = await findAccountGlobally(account.trim());
  const fail = async (message: string, target?: User) => {
    await writeAudit({
      actor: {
        ...actor,
        userId: target?.id ?? null,
        fullName: target?.fullName ?? '未驗證使用者',
        account: account.trim() || 'unknown',
        roleSnapshot: 'UNAUTHENTICATED',
        tenantId: target?.tenantId ?? actor.tenantId,
      },
      action: 'login',
      module: 'auth',
      description: `${target?.fullName ?? account} 登入失敗`,
      result: 'failure',
      targetType: 'user',
      targetId: target?.id,
      targetDisplayName: target?.fullName,
    });
    throw new Error(message);
  };

  if (!user) {
    await fail('帳號或密碼不正確');
    throw new Error('帳號或密碼不正確');
  }
  const secret = await getUserSecret(user.id);
  if (!secret) {
    await fail('帳號或密碼不正確', user);
    throw new Error('帳號或密碼不正確');
  }
  const ok = await verifyPassword(password, {
    algo: secret.password_algo,
    iterations: secret.password_iterations,
    salt: secret.password_salt,
    hash: secret.password_hash,
  });
  if (!ok) {
    await fail('帳號或密碼不正確', user);
  }

  if (user.status === 'pending') {
    throw Object.assign(new Error('帳號正在等待主管開通'), { code: 'PENDING', user });
  }
  if (user.status === 'returned') {
    throw Object.assign(new Error('帳號已退回，請補齊資料後重新送審'), { code: 'RETURNED', user });
  }
  if (user.status === 'rejected') {
    throw Object.assign(new Error('帳號申請已被拒絕'), { code: 'REJECTED', user });
  }
  if (user.status === 'suspended') {
    throw Object.assign(new Error('帳號已停權'), { code: 'SUSPENDED', user });
  }

  await saveSession(createSession(user.id, user.tenantId));
  const snapshot = await roleSnapshotForUser(user.id);
  await writeAudit({
    actor: {
      ...actor,
      userId: user.id,
      fullName: user.fullName,
      account: user.account,
      roleSnapshot: snapshot,
      tenantId: user.tenantId,
    },
    action: 'login',
    module: 'auth',
    description: `${user.fullName} 登入系統`,
    targetType: 'user',
    targetId: user.id,
    targetDisplayName: user.fullName,
  });
  return user;
}

export async function logout(actor: ActorContext): Promise<void> {
  await clearSession();
  if (actor.userId) {
    await writeAudit({
      actor,
      action: 'logout',
      module: 'auth',
      description: `${actor.fullName} 登出系統`,
      targetType: 'user',
      targetId: actor.userId,
      targetDisplayName: actor.fullName,
    });
  }
}

export async function registerAccount(
  tenant: Tenant,
  input: {
    fullName: string;
    phone: string;
    employeeNo: string;
    gender: Gender;
    hireDate: string;
    jobTitle: string;
    account: string;
    password: string;
    confirmPassword: string;
  },
  actor: ActorContext,
): Promise<User> {
  const error = firstError([
    required(input.fullName, '姓名'),
    validatePhone(input.phone),
    validateEmployeeNo(input.employeeNo),
    required(input.hireDate, '到職日期'),
    required(input.jobTitle, '職稱'),
    validateAccount(input.account),
    input.password !== input.confirmPassword ? '兩次輸入的密碼不一致' : null,
    validatePasswordStrength(input.password, input.account).ok
      ? null
      : validatePasswordStrength(input.password, input.account).messages[0] ?? '密碼不符合強度要求',
  ]);
  if (error) {
    throw new Error(error);
  }
  const existing = await getUserByAccount(tenant.id, input.account);
  if (existing) {
    throw new Error('此帳號已被使用');
  }
  const user = await insertUser({
    tenantId: tenant.id,
    fullName: input.fullName,
    phone: input.phone,
    employeeNo: input.employeeNo,
    gender: input.gender,
    hireDate: input.hireDate,
    jobTitle: input.jobTitle,
    account: input.account,
    password: await hashPassword(input.password),
    status: 'pending',
    createdBy: null,
    deviceId: actor.deviceId,
  });
  await writeAudit({
    actor: {
      ...actor,
      userId: user.id,
      fullName: user.fullName,
      account: user.account,
      roleSnapshot: 'APPLICANT',
      tenantId: tenant.id,
    },
    action: 'create',
    module: 'users',
    description: `${user.fullName} 提交帳號註冊申請`,
    targetType: 'user',
    targetId: user.id,
    targetDisplayName: user.fullName,
    after: { account: user.account, status: user.status },
  });
  return user;
}

export async function changeOwnProfile(
  actor: ActorContext,
  userId: string,
  patch: {
    fullName?: string;
    phone?: string;
    employeeNo?: string;
    gender?: Gender;
    hireDate?: string;
    jobTitle?: string;
    photoUri?: string | null;
  },
): Promise<User> {
  const before = await getUserById(userId);
  if (!before) {
    throw new Error('找不到使用者');
  }
  const after = await updateUserProfile(userId, patch);
  const changes: string[] = [];
  if (patch.fullName && patch.fullName !== before.fullName) {
    changes.push(`姓名由「${before.fullName}」修改為「${after.fullName}」`);
  }
  if (patch.phone && patch.phone !== before.phone) {
    changes.push(`手機由「${before.phone ?? '—'}」修改為「${after.phone}」`);
  }
  if (patch.employeeNo && patch.employeeNo !== before.employeeNo) {
    changes.push(`員工編號由「${before.employeeNo ?? '—'}」修改為「${after.employeeNo}」`);
  }
  if (patch.gender && patch.gender !== before.gender) {
    changes.push('修改性別');
  }
  if (patch.hireDate && patch.hireDate !== before.hireDate) {
    changes.push(`到職日由「${before.hireDate ?? '—'}」修改為「${after.hireDate}」`);
  }
  if (patch.jobTitle && patch.jobTitle !== before.jobTitle) {
    changes.push(`職稱由「${before.jobTitle ?? '—'}」修改為「${after.jobTitle}」`);
  }
  if (patch.photoUri !== undefined && patch.photoUri !== before.photoUri) {
    changes.push('更新個人照片');
  }
  const description =
    changes.length > 0
      ? `${actor.fullName} ${changes.join('、')}`
      : `${actor.fullName} 修改個人資料`;
  await writeAudit({
    actor: { ...actor, fullName: after.fullName },
    action: 'update',
    module: 'profile',
    description,
    targetType: 'user',
    targetId: after.id,
    targetDisplayName: after.fullName,
    before,
    after,
  });
  return after;
}

export async function changeOwnPassword(
  actor: ActorContext,
  userId: string,
  currentPassword: string,
  nextPassword: string,
  confirmPassword: string,
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('找不到使用者');
  }
  const secret = await getUserSecret(userId);
  if (!secret) {
    throw new Error('找不到密碼資料');
  }
  const ok = await verifyPassword(currentPassword, {
    algo: secret.password_algo,
    iterations: secret.password_iterations,
    salt: secret.password_salt,
    hash: secret.password_hash,
  });
  if (!ok) {
    throw new Error('目前密碼不正確');
  }
  if (nextPassword !== confirmPassword) {
    throw new Error('兩次輸入的新密碼不一致');
  }
  const strength = validatePasswordStrength(nextPassword, user.account);
  if (!strength.ok) {
    throw new Error(strength.messages[0] ?? '新密碼不符合強度要求');
  }
  await updateUserPassword(userId, await hashPassword(nextPassword));
  await writeAudit({
    actor,
    action: 'update',
    module: 'profile',
    description: `${actor.fullName} 修改登入密碼`,
    targetType: 'user',
    targetId: user.id,
    targetDisplayName: user.fullName,
  });
}

export async function reviewAccount(
  actor: ActorContext,
  userId: string,
  decision: Extract<UserStatus, 'active' | 'returned' | 'rejected'>,
  reviewNote: string | null,
): Promise<User> {
  const before = await getUserById(userId);
  if (!before) {
    throw new Error('找不到申請帳號');
  }
  const after = await updateUserStatus(userId, decision, reviewNote);
  const verb = decision === 'active' ? '開通' : decision === 'returned' ? '退回' : '拒絕';
  await writeAudit({
    actor,
    action: decision === 'active' ? 'approve' : 'update',
    module: 'accounts',
    description: `${actor.fullName} ${verb}員工「${after.fullName}」帳號`,
    targetType: 'user',
    targetId: after.id,
    targetDisplayName: after.fullName,
    before,
    after,
  });
  return after;
}

export { getUserById };
