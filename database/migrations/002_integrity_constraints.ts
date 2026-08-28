import type { Migration } from './001_initial';
import type { SqlDatabase } from '../runtime';

const CLEANUP_DUPLICATES_SQL = `
UPDATE user_roles
SET deleted_at = datetime('now'),
    updated_at = datetime('now'),
    version = version + 1,
    sync_status = 'pending'
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id, role_id
               ORDER BY updated_at DESC, created_at DESC, id DESC
             ) AS rn
      FROM user_roles
      WHERE deleted_at IS NULL
    ) ranked
    WHERE ranked.rn = 1
  );

UPDATE user_site_permissions
SET deleted_at = datetime('now'),
    updated_at = datetime('now'),
    status = 'inactive',
    version = version + 1,
    sync_status = 'pending'
WHERE deleted_at IS NULL
  AND status = 'active'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id, site_id
               ORDER BY updated_at DESC, created_at DESC, id DESC
             ) AS rn
      FROM user_site_permissions
      WHERE deleted_at IS NULL AND status = 'active'
    ) ranked
    WHERE ranked.rn = 1
  );

UPDATE user_permission_overrides
SET deleted_at = datetime('now'),
    updated_at = datetime('now'),
    version = version + 1,
    sync_status = 'pending'
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id, permission_id
               ORDER BY updated_at DESC, created_at DESC, id DESC
             ) AS rn
      FROM user_permission_overrides
      WHERE deleted_at IS NULL
    ) ranked
    WHERE ranked.rn = 1
  );
`;

function rebuild(table: string, createSql: string, columns: string): string {
  return `
CREATE TABLE ${table}__new (
${createSql}
);
INSERT INTO ${table}__new (${columns})
SELECT ${columns} FROM ${table};
DROP TABLE ${table};
ALTER TABLE ${table}__new RENAME TO ${table};
`;
}

const USERS_COLS = `id, tenant_id, full_name, phone, employee_no, gender, hire_date, job_title, account,
  password_hash, password_salt, password_algo, password_iterations, photo_uri, status, review_note,
  created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const ROLES_COLS = `id, tenant_id, role_key, name, description, is_system, status,
  created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const ROLE_PERMISSIONS_COLS = `id, tenant_id, role_id, permission_id, created_at`;

const USER_ROLES_COLS = `id, tenant_id, user_id, role_id, starts_at, expires_at, is_permanent,
  created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const OVERRIDES_COLS = `id, tenant_id, user_id, permission_id, effect, starts_at, expires_at, is_permanent,
  created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const SITES_COLS = `id, tenant_id, site_code, name, address, latitude, longitude, attendance_radius,
  require_gps, require_site_qr, status, starts_at, expires_at,
  created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const USER_SITES_COLS = `id, tenant_id, user_id, site_id, starts_at, expires_at, is_permanent, status,
  created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const AUDIT_COLS = `id, tenant_id, site_id, actor_user_id, actor_name_snapshot, actor_account_snapshot,
  actor_role_snapshot, action, module, target_type, target_id, target_display_name,
  description, before_data, after_data, result, device_id, app_version, created_at`;

const REBUILD_SQL = [
  rebuild(
    'users',
    `
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
  UNIQUE (tenant_id, account),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    USERS_COLS,
  ),
  rebuild(
    'roles',
    `
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
  UNIQUE (tenant_id, role_key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    ROLES_COLS,
  ),
  rebuild(
    'role_permissions',
    `
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (role_id, permission_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    ROLE_PERMISSIONS_COLS,
  ),
  rebuild(
    'user_roles',
    `
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
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    USER_ROLES_COLS,
  ),
  rebuild(
    'user_permission_overrides',
    `
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
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    OVERRIDES_COLS,
  ),
  rebuild(
    'sites',
    `
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
  UNIQUE (tenant_id, site_code),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    SITES_COLS,
  ),
  rebuild(
    'user_site_permissions',
    `
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
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION
`,
    USER_SITES_COLS,
  ),
  rebuild(
    'audit_logs',
    `
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
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
`,
    AUDIT_COLS,
  ),
].join('\n');

const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sites_tenant ON sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_sites_user ON user_site_permissions(tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(tenant_id, role_id);
CREATE INDEX IF NOT EXISTS idx_overrides_user ON user_permission_overrides(tenant_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_active_unique
  ON user_roles(tenant_id, user_id, role_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sites_active_unique
  ON user_site_permissions(tenant_id, user_id, site_id)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_overrides_active_unique
  ON user_permission_overrides(tenant_id, user_id, permission_id)
  WHERE deleted_at IS NULL;
`;

export const migration002: Migration = {
  version: 2,
  name: '002_integrity_constraints',
  up: async (db: SqlDatabase) => {
    await db.exec(CLEANUP_DUPLICATES_SQL);
    await db.exec(REBUILD_SQL);
    await db.exec(INDEXES_SQL);
  },
};
