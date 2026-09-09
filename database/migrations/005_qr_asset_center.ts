import { ROLE_KEYS } from '@/constants/app';
import { EXTRA_PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@/constants/permissions';
import { PHASE2B1_PERMISSION_KEYS } from '@/constants/phase2Permissions';
import type { SqlDatabase } from '../runtime';
import { permissionIdForKey, type Migration } from './001_initial';

const TABLES = `
CREATE TABLE IF NOT EXISTS qr_assets (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('employee', 'site', 'patrol_point', 'equipment', 'key_item')),
  target_type TEXT NOT NULL CHECK (target_type IN ('employee', 'site', 'patrol_point', 'equipment', 'key_item')),
  target_id TEXT NOT NULL,
  qr_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  deactivated_by TEXT,
  deactivated_at TEXT,
  deactivate_reason TEXT,
  last_scan_at TEXT,
  scan_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (scan_count >= 0),
  CHECK (status != 'inactive' OR (deactivated_at IS NOT NULL AND deactivate_reason IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  qr_asset_id TEXT,
  scanner_user_id TEXT,
  scanner_name_snapshot TEXT NOT NULL,
  scanner_role_snapshot TEXT,
  scanned_code TEXT NOT NULL,
  scan_result TEXT NOT NULL CHECK (scan_result IN ('valid', 'invalid', 'inactive', 'unauthorized', 'cross_tenant')),
  scanned_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  device_id TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (qr_asset_id) REFERENCES qr_assets(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (scanner_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);
`;

const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_assets_code ON qr_assets(qr_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_assets_active_target
  ON qr_assets(tenant_id, target_type, target_id)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_qr_assets_tenant ON qr_assets(tenant_id, asset_type, status);
CREATE INDEX IF NOT EXISTS idx_qr_assets_target ON qr_assets(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_tenant ON qr_scan_logs(tenant_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_asset ON qr_scan_logs(qr_asset_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_scanner ON qr_scan_logs(scanner_user_id, scanned_at);
`;

export const migration005: Migration = {
  version: 5,
  name: '005_qr_asset_center',
  up: async (db: SqlDatabase) => {
    await db.exec(TABLES);
    await db.exec(INDEXES);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE2B1_PERMISSION_KEYS) {
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
    const grant = async (role: { id: string; tenant_id: string }, keys: readonly string[]) => {
      for (const key of keys) {
        await db.run(
          `INSERT OR IGNORE INTO role_permissions (id, tenant_id, role_id, permission_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [`rp-${role.id}-${permissionIdForKey(key)}`, role.tenant_id, role.id, permissionIdForKey(key), now],
        );
      }
    };
    for (const role of roles) {
      if (role.role_key === ROLE_KEYS.SUPER_ADMIN || role.role_key === ROLE_KEYS.MANAGER) {
        await grant(role, PHASE2B1_PERMISSION_KEYS);
      } else if (role.role_key === ROLE_KEYS.STAFF) {
        await grant(
          role,
          STAFF_DEFAULT_PERMISSIONS.filter((key) => (PHASE2B1_PERMISSION_KEYS as readonly string[]).includes(key)),
        );
      }
    }
  },
};
