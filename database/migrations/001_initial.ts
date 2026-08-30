import { buildPermissionCatalog } from '@/constants/permissions';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/datetime';

import type { SqlDatabase } from '../runtime';

export interface Migration {
  version: number;
  name: string;
  up: string | ((db: SqlDatabase) => Promise<void>);
}

const permissionInserts = buildPermissionCatalog()
  .map((item) => {
    const id = `perm-${item.permKey.replace(/[.]/g, '-')}`;
    const desc = item.description.replace(/'/g, "''");
    const name = item.name.replace(/'/g, "''");
    return `INSERT INTO permissions (id, perm_key, module, action, name, description) VALUES ('${id}', '${item.permKey}', '${item.module}', '${item.action}', '${name}', '${desc}');`;
  })
  .join('\n');

export const MIGRATION_001_SQL = `
CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  official_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  tax_id TEXT,
  phone TEXT,
  address TEXT,
  logo_uri TEXT,
  industry_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  employee_no TEXT,
  gender TEXT NOT NULL DEFAULT 'unspecified',
  hire_date TEXT,
  job_title TEXT,
  account TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_algo TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  photo_uri TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  UNIQUE (tenant_id, account)
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  UNIQUE (tenant_id, role_key)
);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY NOT NULL,
  perm_key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE role_permissions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (role_id, permission_id)
);

CREATE TABLE user_roles (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT,
  is_permanent INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT
);

CREATE TABLE user_permission_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  effect TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT,
  is_permanent INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT
);

CREATE TABLE sites (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  attendance_radius REAL,
  require_gps INTEGER NOT NULL DEFAULT 0,
  require_site_qr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TEXT,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  UNIQUE (tenant_id, site_code)
);

CREATE TABLE user_site_permissions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT,
  is_permanent INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT,
  site_id TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT NOT NULL,
  actor_account_snapshot TEXT NOT NULL,
  actor_role_snapshot TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_display_name TEXT,
  description TEXT NOT NULL,
  before_data TEXT,
  after_data TEXT,
  result TEXT NOT NULL DEFAULT 'success',
  device_id TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE app_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_status ON users(tenant_id, status);
CREATE INDEX idx_sites_tenant ON sites(tenant_id);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_user_sites_user ON user_site_permissions(user_id, status);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);

${permissionInserts}
`;

export const migration001: Migration = {
  version: 1,
  name: '001_initial',
  up: MIGRATION_001_SQL,
};

export function permissionIdForKey(permKey: string): string {
  return `perm-${permKey.replace(/[.]/g, '-')}`;
}

export { createId, nowIso };
