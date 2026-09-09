import { ROLE_KEYS } from '@/constants/app';
import { PHASE3B_PERMISSION_KEYS, PHASE3B_STAFF_PERMISSION_KEYS } from '@/constants/mobility';
import { EXTRA_PERMISSIONS } from '@/constants/permissions';
import type { SqlDatabase } from '../runtime';
import { permissionIdForKey, type Migration } from './001_initial';

const META = `
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
`;

const TABLES = `
CREATE TABLE IF NOT EXISTS site_parking_settings (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  visitor_max_duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (visitor_max_duration_minutes > 0),
  temporary_max_duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (temporary_max_duration_minutes > 0),
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS parking_spaces (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  zone TEXT,
  floor TEXT,
  space_no TEXT NOT NULL,
  display_name TEXT NOT NULL,
  space_type TEXT NOT NULL CHECK (space_type IN ('private', 'common', 'visitor', 'temporary', 'accessible', 'loading', 'motorcycle', 'other')),
  vehicle_type TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('car', 'motorcycle', 'mixed')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  notes TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS parking_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  parking_space_id TEXT NOT NULL,
  unit_id TEXT,
  resident_id TEXT,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('owned', 'leased', 'authorized', 'temporary', 'common_use')),
  starts_at TEXT,
  ends_at TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (parking_space_id) REFERENCES parking_spaces(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS resident_vehicles (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  resident_id TEXT,
  unit_id TEXT,
  plate_no TEXT NOT NULL,
  plate_no_normalized TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('car', 'motorcycle', 'other')),
  brand TEXT,
  model TEXT,
  color TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed')),
  allow_duplicate INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (resident_id) REFERENCES residents(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS vehicle_access_passes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  vehicle_id TEXT,
  unit_id TEXT,
  visitor_pass_id TEXT,
  plate_no_snapshot TEXT NOT NULL,
  plate_no_normalized TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('resident', 'visitor', 'vendor', 'delivery', 'temporary', 'moving', 'construction', 'other')),
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  notes TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (vehicle_id) REFERENCES resident_vehicles(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (unit_id) REFERENCES site_units(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (visitor_pass_id) REFERENCES visitor_passes(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS vehicle_movements (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  vehicle_id TEXT,
  access_pass_id TEXT,
  plate_no_snapshot TEXT NOT NULL,
  plate_no_normalized TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  gate_name TEXT,
  occurred_at TEXT NOT NULL,
  processed_by TEXT,
  photo_uri TEXT,
  latitude REAL,
  longitude REAL,
  note TEXT,
  time_source TEXT NOT NULL DEFAULT 'device' CHECK (time_source IN ('device', 'server')),
  device_time TEXT NOT NULL,
  server_time TEXT,
  event_kind TEXT NOT NULL DEFAULT 'movement' CHECK (event_kind IN ('movement', 'correction', 'void', 'reversal')),
  corrects_id TEXT,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (vehicle_id) REFERENCES resident_vehicles(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (access_pass_id) REFERENCES vehicle_access_passes(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS parking_occupancies (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  parking_space_id TEXT NOT NULL,
  vehicle_id TEXT,
  access_pass_id TEXT,
  plate_no_snapshot TEXT NOT NULL,
  occupied_from TEXT NOT NULL,
  occupied_until TEXT,
  status TEXT NOT NULL DEFAULT 'occupied' CHECK (status IN ('occupied', 'released', 'overstayed', 'violation', 'corrected')),
  source TEXT NOT NULL DEFAULT 'guard' CHECK (source IN ('manual', 'guard', 'future_lpr', 'qr')),
  confidence REAL,
  capture_image_uri TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (parking_space_id) REFERENCES parking_spaces(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (vehicle_id) REFERENCES resident_vehicles(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (access_pass_id) REFERENCES vehicle_access_passes(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS parking_violations (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  parking_space_id TEXT,
  vehicle_id TEXT,
  occupancy_id TEXT,
  plate_no_snapshot TEXT NOT NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('unauthorized_space', 'visitor_overstay', 'no_pass', 'wrong_space', 'blocking', 'fire_lane', 'accessible_misuse', 'other')),
  severity TEXT NOT NULL DEFAULT 'general' CHECK (severity IN ('general', 'important', 'urgent')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processing', 'resolved', 'voided')),
  reported_by TEXT,
  reported_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  photo_uri TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (parking_space_id) REFERENCES parking_spaces(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (vehicle_id) REFERENCES resident_vehicles(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (occupancy_id) REFERENCES parking_occupancies(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS managed_keys (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  key_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  storage_location TEXT,
  key_type TEXT NOT NULL DEFAULT 'physical' CHECK (key_type IN ('physical', 'card', 'remote', 'other')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'checked_out', 'lost', 'damaged', 'inactive')),
  qr_asset_id TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (qr_asset_id) REFERENCES qr_assets(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS key_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('checkout', 'return', 'correction', 'lost', 'damaged')),
  borrower_type TEXT NOT NULL CHECK (borrower_type IN ('staff', 'resident', 'vendor', 'other')),
  borrower_user_id TEXT,
  borrower_resident_id TEXT,
  borrower_name_snapshot TEXT NOT NULL,
  purpose TEXT,
  checked_out_at TEXT,
  due_at TEXT,
  returned_at TEXT,
  condition_out TEXT,
  condition_in TEXT,
  processed_by TEXT,
  note TEXT,
  compensation_review_required INTEGER NOT NULL DEFAULT 0,
  corrects_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (key_id) REFERENCES managed_keys(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (borrower_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (borrower_resident_id) REFERENCES residents(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS loan_items (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  storage_location TEXT,
  requires_deposit INTEGER NOT NULL DEFAULT 0,
  deposit_reference_amount REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  qr_asset_id TEXT,
  notes TEXT,
  ${META},
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (qr_asset_id) REFERENCES qr_assets(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (available_quantity <= total_quantity)
);

CREATE TABLE IF NOT EXISTS item_loan_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('borrow', 'return', 'correction', 'lost', 'damaged')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  borrower_type TEXT NOT NULL CHECK (borrower_type IN ('staff', 'resident', 'vendor', 'other')),
  borrower_user_id TEXT,
  borrower_resident_id TEXT,
  borrower_name_snapshot TEXT NOT NULL,
  purpose TEXT,
  borrowed_at TEXT,
  due_at TEXT,
  returned_at TEXT,
  condition_out TEXT,
  condition_in TEXT,
  processed_by TEXT,
  photo_uri TEXT,
  note TEXT,
  related_transaction_id TEXT,
  compensation_review_required INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (item_id) REFERENCES loan_items(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (borrower_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (borrower_resident_id) REFERENCES residents(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);
`;

const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_parking_settings_site
  ON site_parking_settings(tenant_id, site_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parking_spaces_code
  ON parking_spaces(tenant_id, site_id, IFNULL(zone, ''), IFNULL(floor, ''), space_no)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_parking_spaces_site ON parking_spaces(tenant_id, site_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parking_assignments_exclusive_current
  ON parking_assignments(tenant_id, parking_space_id)
  WHERE deleted_at IS NULL AND is_current = 1 AND assignment_type IN ('owned', 'leased', 'authorized', 'temporary');
CREATE INDEX IF NOT EXISTS idx_parking_assignments_space ON parking_assignments(tenant_id, parking_space_id, is_current);
CREATE INDEX IF NOT EXISTS idx_parking_assignments_unit ON parking_assignments(tenant_id, unit_id, is_current);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resident_vehicles_active_plate
  ON resident_vehicles(tenant_id, site_id, plate_no_normalized)
  WHERE deleted_at IS NULL AND status = 'active' AND allow_duplicate = 0;
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_site ON resident_vehicles(tenant_id, site_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_access_site ON vehicle_access_passes(tenant_id, site_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_movements_plate ON vehicle_movements(tenant_id, site_id, plate_no_normalized, created_at);
CREATE INDEX IF NOT EXISTS idx_parking_occupancies_space ON parking_occupancies(tenant_id, parking_space_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parking_occupancies_open_space
  ON parking_occupancies(tenant_id, parking_space_id)
  WHERE deleted_at IS NULL AND occupied_until IS NULL AND status IN ('occupied', 'overstayed', 'violation');
CREATE INDEX IF NOT EXISTS idx_parking_violations_site ON parking_violations(tenant_id, site_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_keys_code
  ON managed_keys(tenant_id, site_id, key_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_key_transactions_key ON key_transactions(tenant_id, key_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_items_code
  ON loan_items(tenant_id, site_id, item_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_item_loan_tx_item ON item_loan_transactions(tenant_id, item_id, created_at);
`;

const TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS trg_vehicle_movements_no_update
BEFORE UPDATE ON vehicle_movements
BEGIN
  SELECT RAISE(ABORT, '車輛進出紀錄僅能新增，不可修改或刪除');
END;
CREATE TRIGGER IF NOT EXISTS trg_vehicle_movements_no_delete
BEFORE DELETE ON vehicle_movements
BEGIN
  SELECT RAISE(ABORT, '車輛進出紀錄僅能新增，不可修改或刪除');
END;
CREATE TRIGGER IF NOT EXISTS trg_key_transactions_no_update
BEFORE UPDATE ON key_transactions
BEGIN
  SELECT RAISE(ABORT, '鑰匙借還紀錄僅能新增，不可修改或刪除');
END;
CREATE TRIGGER IF NOT EXISTS trg_key_transactions_no_delete
BEFORE DELETE ON key_transactions
BEGIN
  SELECT RAISE(ABORT, '鑰匙借還紀錄僅能新增，不可修改或刪除');
END;
CREATE TRIGGER IF NOT EXISTS trg_item_loan_transactions_no_update
BEFORE UPDATE ON item_loan_transactions
BEGIN
  SELECT RAISE(ABORT, '物品借還紀錄僅能新增，不可修改或刪除');
END;
CREATE TRIGGER IF NOT EXISTS trg_item_loan_transactions_no_delete
BEFORE DELETE ON item_loan_transactions
BEGIN
  SELECT RAISE(ABORT, '物品借還紀錄僅能新增，不可修改或刪除');
END;
`;

const QR_ASSETS_CREATE = `
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('employee', 'site', 'patrol_point', 'equipment', 'key_item')),
  target_type TEXT NOT NULL CHECK (target_type IN ('employee', 'site', 'patrol_point', 'equipment', 'key_item', 'managed_key', 'loan_item')),
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
`;

const QR_COLS = `id, tenant_id, site_id, asset_type, target_type, target_id, qr_code, display_name, status,
  created_by, created_at, deactivated_by, deactivated_at, deactivate_reason, last_scan_at, scan_count,
  updated_at, deleted_at, version, sync_status, device_id`;

export const migration010: Migration = {
  version: 10,
  name: '010_vehicle_parking_key_assets',
  up: async (db: SqlDatabase) => {
    await db.exec(`
      CREATE TABLE qr_assets__new (
        ${QR_ASSETS_CREATE}
      );
      INSERT INTO qr_assets__new (${QR_COLS})
      SELECT ${QR_COLS} FROM qr_assets;
      DROP TABLE qr_assets;
      ALTER TABLE qr_assets__new RENAME TO qr_assets;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_assets_code ON qr_assets(qr_code);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_assets_active_target
        ON qr_assets(tenant_id, target_type, target_id)
        WHERE deleted_at IS NULL AND status = 'active';
      CREATE INDEX IF NOT EXISTS idx_qr_assets_tenant ON qr_assets(tenant_id, asset_type, status);
      CREATE INDEX IF NOT EXISTS idx_qr_assets_target ON qr_assets(target_type, target_id);
    `);

    await db.exec(TABLES);
    await db.exec(INDEXES);
    await db.exec(TRIGGERS);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE3B_PERMISSION_KEYS) {
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
        await grant(role, PHASE3B_PERMISSION_KEYS);
      } else if (role.role_key === ROLE_KEYS.STAFF) {
        await grant(role, PHASE3B_STAFF_PERMISSION_KEYS);
      }
    }
  },
};
