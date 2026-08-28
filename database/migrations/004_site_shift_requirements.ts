import { ROLE_KEYS } from '@/constants/app';
import { EXTRA_PERMISSIONS } from '@/constants/permissions';
import { PHASE2A1_PERMISSION_KEYS } from '@/constants/phase2Permissions';
import type { SqlDatabase } from '../runtime';
import { permissionIdForKey, type Migration } from './001_initial';

const TABLES = `
CREATE TABLE IF NOT EXISTS site_shift_requirements (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  shift_template_id TEXT,
  effective_start_date TEXT NOT NULL,
  effective_end_date TEXT,
  required_headcount INTEGER NOT NULL,
  staffing_mode TEXT CHECK (staffing_mode IS NULL OR staffing_mode IN ('fixed', 'mobile', 'trainee')),
  weekday INTEGER CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (required_headcount >= 0),
  CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_site_shift_req_tenant ON site_shift_requirements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_shift_req_site ON site_shift_requirements(site_id, shift_template_id);
CREATE INDEX IF NOT EXISTS idx_site_shift_req_dates ON site_shift_requirements(site_id, effective_start_date, effective_end_date);
`;

export const migration004: Migration = {
  version: 4,
  name: '004_site_shift_requirements',
  up: async (db: SqlDatabase) => {
    await db.exec(TABLES);
    await db.exec(INDEXES);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE2A1_PERMISSION_KEYS) {
      const extra = extraByKey.get(key);
      if (!extra) continue;
      await db.run(
        `INSERT OR IGNORE INTO permissions (id, perm_key, module, action, name, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [permissionIdForKey(key), extra.permKey, extra.module, extra.action, extra.name, extra.description],
      );
    }

    const roles = await db.getAll<{ id: string; tenant_id: string; role_key: string }>(
      `SELECT id, tenant_id, role_key FROM roles WHERE deleted_at IS NULL`,
    );
    for (const role of roles) {
      if (role.role_key !== ROLE_KEYS.SUPER_ADMIN && role.role_key !== ROLE_KEYS.MANAGER) continue;
      for (const key of PHASE2A1_PERMISSION_KEYS) {
        await db.run(
          `INSERT OR IGNORE INTO role_permissions (id, tenant_id, role_id, permission_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [`rp-${role.id}-${permissionIdForKey(key)}`, role.tenant_id, role.id, permissionIdForKey(key), now],
        );
      }
    }
  },
};
