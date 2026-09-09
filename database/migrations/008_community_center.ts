import { ROLE_KEYS } from '@/constants/app';
import { PHASE3A_PERMISSION_KEYS, PHASE3A_STAFF_PERMISSION_KEYS } from '@/constants/community';
import { EXTRA_PERMISSIONS } from '@/constants/permissions';
import type { SqlDatabase } from '../runtime';
import { permissionIdForKey, type Migration } from './001_initial';

const TABLES = `
CREATE TABLE IF NOT EXISTS site_units (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  building TEXT,
  floor TEXT,
  unit_no TEXT NOT NULL,
  display_name TEXT NOT NULL,
  occupancy_type TEXT NOT NULL DEFAULT 'vacant' CHECK (occupancy_type IN ('vacant', 'owner_occupied', 'rented', 'mixed')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS residents (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  gender TEXT NOT NULL DEFAULT 'unspecified',
  id_last4 TEXT,
  photo_uri TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  move_in_at TEXT,
  move_out_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'moved_out')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS resident_occupancies (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  resident_id TEXT NOT NULL,
  relation_key TEXT NOT NULL CHECK (relation_key IN ('owner', 'tenant', 'family', 'occupant', 'agent')),
  relation_label_snapshot TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS visitor_passes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  host_resident_id TEXT,
  visitor_kind TEXT NOT NULL CHECK (visitor_kind IN ('guest', 'vendor', 'delivery', 'temporary')),
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT,
  visitor_company TEXT,
  id_last4 TEXT,
  purpose TEXT,
  expected_at TEXT,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'checked_out', 'cancelled', 'expired')),
  host_name_snapshot TEXT NOT NULL,
  unit_label_snapshot TEXT NOT NULL,
  checked_in_at TEXT,
  checked_out_at TEXT,
  time_source TEXT NOT NULL DEFAULT 'device' CHECK (time_source IN ('device', 'server')),
  device_time TEXT NOT NULL,
  server_time TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (host_resident_id) REFERENCES residents(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS visitor_movements (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  visitor_pass_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  occurred_at TEXT NOT NULL,
  processed_by TEXT,
  photo_uri TEXT,
  note TEXT,
  latitude REAL,
  longitude REAL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (visitor_pass_id) REFERENCES visitor_passes(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  resident_id TEXT,
  tracking_no TEXT,
  courier_name TEXT,
  parcel_kind TEXT NOT NULL DEFAULT 'general' CHECK (parcel_kind IN ('general', 'registered', 'refrigerated', 'oversized')),
  location_note TEXT,
  photo_uri TEXT,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'notified', 'picked_up', 'returned', 'cancelled')),
  recipient_name_snapshot TEXT NOT NULL,
  unit_label_snapshot TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  notified_at TEXT,
  pickup_at TEXT,
  pickup_by_name TEXT,
  pickup_photo_uri TEXT,
  pickup_signature_note TEXT,
  picked_up_by_staff_id TEXT,
  time_source TEXT NOT NULL DEFAULT 'device' CHECK (time_source IN ('device', 'server')),
  device_time TEXT NOT NULL,
  server_time TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (picked_up_by_staff_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS parcel_events (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  parcel_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name_snapshot TEXT NOT NULL,
  note TEXT,
  photo_uri TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);
`;

const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_units_code
  ON site_units(tenant_id, site_id, building, floor, unit_no) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_residents_unit ON residents(tenant_id, unit_id, status);
CREATE INDEX IF NOT EXISTS idx_occupancies_resident ON resident_occupancies(tenant_id, resident_id, is_current);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_site ON visitor_passes(tenant_id, site_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_parcels_site ON parcels(tenant_id, site_id, status, registered_at);
`;

export const migration008: Migration = {
  version: 8,
  name: '008_community_center',
  up: async (db: SqlDatabase) => {
    await db.exec(TABLES);
    await db.exec(INDEXES);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE3A_PERMISSION_KEYS) {
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
        await grant(role, PHASE3A_PERMISSION_KEYS);
      } else if (role.role_key === ROLE_KEYS.STAFF) {
        await grant(role, PHASE3A_STAFF_PERMISSION_KEYS);
      }
    }
  },
};
