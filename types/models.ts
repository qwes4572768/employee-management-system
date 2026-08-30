export type SyncStatus = 'local' | 'pending' | 'synced' | 'failed' | 'conflict';

export type EntityStatus = 'active' | 'inactive' | 'archived' | 'suspended';

export type UserStatus = 'pending' | 'returned' | 'rejected' | 'active' | 'suspended';

export type SiteStatus = 'active' | 'inactive' | 'archived';

export type Gender = 'male' | 'female' | 'unspecified';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'approve'
  | 'viewSensitive'
  | 'viewHistory'
  | 'viewAuditLog';

export type RoleKey = 'SUPER_ADMIN' | 'MANAGER' | 'STAFF' | string;

export type PermissionEffect = 'allow' | 'deny';

export type AuditResult = 'success' | 'failure';

export interface SyncMeta {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  syncStatus: SyncStatus;
  deviceId: string | null;
}

export interface Tenant extends SyncMeta {
  id: string;
  officialName: string;
  shortName: string;
  taxId: string | null;
  phone: string | null;
  address: string | null;
  logoUri: string | null;
  industryType: string | null;
  status: EntityStatus;
}

export interface User extends SyncMeta {
  id: string;
  tenantId: string;
  fullName: string;
  phone: string | null;
  employeeNo: string | null;
  gender: Gender;
  hireDate: string | null;
  jobTitle: string | null;
  account: string;
  photoUri: string | null;
  status: UserStatus;
  reviewNote: string | null;
  staffingMode: 'fixed' | 'mobile' | 'trainee';
}

export interface Role extends SyncMeta {
  id: string;
  tenantId: string;
  roleKey: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  status: EntityStatus;
}

export interface Permission {
  id: string;
  permKey: string;
  module: string;
  action: string;
  name: string;
  description: string | null;
}

export interface RolePermission {
  id: string;
  tenantId: string;
  roleId: string;
  permissionId: string;
  createdAt: string;
}

export interface UserRole extends SyncMeta {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
}

export interface UserPermissionOverride extends SyncMeta {
  id: string;
  tenantId: string;
  userId: string;
  permissionId: string;
  effect: PermissionEffect;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
}

export interface Site extends SyncMeta {
  id: string;
  tenantId: string;
  siteCode: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  attendanceRadius: number | null;
  requireGps: boolean;
  requireSiteQr: boolean;
  status: SiteStatus;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface UserSitePermission extends SyncMeta {
  id: string;
  tenantId: string;
  userId: string;
  siteId: string;
  startsAt: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
  status: EntityStatus;
}

export interface AuditLog {
  id: string;
  tenantId: string | null;
  siteId: string | null;
  actorUserId: string | null;
  actorNameSnapshot: string;
  actorAccountSnapshot: string;
  actorRoleSnapshot: string;
  action: string;
  module: string;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  description: string;
  beforeData: string | null;
  afterData: string | null;
  result: AuditResult;
  deviceId: string | null;
  appVersion: string | null;
  createdAt: string;
}

export interface SessionPayload {
  sessionToken: string;
  userId: string;
  tenantId: string;
  expiresAt: string;
}

export interface AuthContextValue {
  session: SessionPayload | null;
  user: User | null;
  tenant: Tenant | null;
  roles: Role[];
  permissionKeys: string[];
  currentSite: Site | null;
  authorizedSites: Site[];
  bootstrapComplete: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
}
