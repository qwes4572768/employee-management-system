import { DEFAULT_ROLE_NAMES, ROLE_KEYS } from '@/constants/app';
import {
  MANAGER_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  buildPermissionCatalog,
} from '@/constants/permissions';
import { insertRole } from '@/repositories/roleRepository';
import { assignUserRole, setRolePermissions } from '@/repositories/permissionRepository';
import { insertTenant } from '@/repositories/tenantRepository';
import { insertUser } from '@/repositories/userRepository';
import { ensureTenantWorkforceDefaults } from '@/repositories/workforceRepository';
import { ensureLeavePolicy } from '@/repositories/leaveRepository';
import type { Gender, Tenant, User } from '@/types';
import { hashPassword, validatePasswordStrength } from '@/utils/password';
import {
  firstError,
  required,
  validateAccount,
  validateEmployeeNo,
  validatePhone,
  validateTaxId,
} from '@/utils/validation';

import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { createSession, saveSession } from './sessionStore';
import { createSite } from './siteService';

export interface BootstrapAdminInput {
  fullName: string;
  phone: string;
  employeeNo: string;
  gender: Gender;
  hireDate: string;
  jobTitle: string;
  account: string;
  password: string;
  confirmPassword: string;
}

export interface BootstrapCompanyInput {
  officialName: string;
  shortName: string;
  taxId?: string;
  phone?: string;
  address?: string;
  industryType?: string;
}

export interface BootstrapSiteInput {
  siteCode: string;
  name: string;
  address?: string;
  attendanceRadius?: number | null;
  requireGps?: boolean;
  requireSiteQr?: boolean;
}

export function validateAdminInput(input: BootstrapAdminInput): string | null {
  return firstError([
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
}

export function validateCompanyInput(input: BootstrapCompanyInput): string | null {
  return firstError([
    required(input.officialName, '公司正式名稱'),
    required(input.shortName, '公司簡稱'),
    input.taxId ? validateTaxId(input.taxId) : null,
  ]);
}

export async function bootstrapSystem(input: {
  admin: BootstrapAdminInput;
  company: BootstrapCompanyInput;
  site?: BootstrapSiteInput | null;
  actor: ActorContext;
}): Promise<{ tenant: Tenant; user: User }> {
  const adminError = validateAdminInput(input.admin);
  if (adminError) {
    throw new Error(adminError);
  }
  const companyError = validateCompanyInput(input.company);
  if (companyError) {
    throw new Error(companyError);
  }

  const password = await hashPassword(input.admin.password);
  const tenant = await insertTenant({
    officialName: input.company.officialName,
    shortName: input.company.shortName,
    taxId: input.company.taxId,
    phone: input.company.phone,
    address: input.company.address,
    industryType: input.company.industryType,
    createdBy: null,
    deviceId: input.actor.deviceId,
  });
  await ensureTenantWorkforceDefaults(tenant.id);
  await ensureLeavePolicy(tenant.id);

  const user = await insertUser({
    tenantId: tenant.id,
    fullName: input.admin.fullName,
    phone: input.admin.phone,
    employeeNo: input.admin.employeeNo,
    gender: input.admin.gender,
    hireDate: input.admin.hireDate,
    jobTitle: input.admin.jobTitle,
    account: input.admin.account,
    password,
    status: 'active',
    createdBy: null,
    deviceId: input.actor.deviceId,
  });

  const superAdmin = await insertRole({
    tenantId: tenant.id,
    roleKey: ROLE_KEYS.SUPER_ADMIN,
    name: DEFAULT_ROLE_NAMES.SUPER_ADMIN ?? '企業總管理員',
    description: '平台初始化企業總管理員，擁有完整權限',
    isSystem: true,
    createdBy: user.id,
    deviceId: input.actor.deviceId,
  });
  const manager = await insertRole({
    tenantId: tenant.id,
    roleKey: ROLE_KEYS.MANAGER,
    name: DEFAULT_ROLE_NAMES.MANAGER ?? '主管',
    description: '案場與人員主管',
    isSystem: true,
    createdBy: user.id,
    deviceId: input.actor.deviceId,
  });
  const staff = await insertRole({
    tenantId: tenant.id,
    roleKey: ROLE_KEYS.STAFF,
    name: DEFAULT_ROLE_NAMES.STAFF ?? '一般勤務人員',
    description: '一般勤務人員',
    isSystem: true,
    createdBy: user.id,
    deviceId: input.actor.deviceId,
  });

  const allKeys = buildPermissionCatalog().map((item) => item.permKey);
  await setRolePermissions(tenant.id, superAdmin.id, allKeys);
  await setRolePermissions(tenant.id, manager.id, [...MANAGER_DEFAULT_PERMISSIONS]);
  await setRolePermissions(tenant.id, staff.id, [...STAFF_DEFAULT_PERMISSIONS]);

  await assignUserRole({
    tenantId: tenant.id,
    userId: user.id,
    roleId: superAdmin.id,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    createdBy: user.id,
    deviceId: input.actor.deviceId,
  });

  const actor: ActorContext = {
    ...input.actor,
    userId: user.id,
    fullName: user.fullName,
    account: user.account,
    roleSnapshot: superAdmin.name,
    tenantId: tenant.id,
  };

  await writeAudit({
    actor,
    action: 'create',
    module: 'tenants',
    description: `${user.fullName} 建立公司「${tenant.officialName}」`,
    targetType: 'tenant',
    targetId: tenant.id,
    targetDisplayName: tenant.officialName,
    after: tenant,
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'users',
    description: `${user.fullName} 建立總管理員帳號「${user.fullName}」`,
    targetType: 'user',
    targetId: user.id,
    targetDisplayName: user.fullName,
    after: { id: user.id, account: user.account, role: superAdmin.roleKey },
  });
  await writeAudit({
    actor,
    action: 'create',
    module: 'roles',
    description: `${user.fullName} 建立系統角色「${superAdmin.name}」「${manager.name}」「${staff.name}」`,
    targetType: 'role',
    targetId: superAdmin.id,
    targetDisplayName: superAdmin.name,
  });

  if (input.site && input.site.name.trim() && input.site.siteCode.trim()) {
    await createSite(actor, {
      tenantId: tenant.id,
      siteCode: input.site.siteCode,
      name: input.site.name,
      address: input.site.address,
      attendanceRadius: input.site.attendanceRadius,
      requireGps: input.site.requireGps,
      requireSiteQr: input.site.requireSiteQr,
    });
  }

  await saveSession(createSession(user.id, tenant.id));
  return { tenant, user };
}
