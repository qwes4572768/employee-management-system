import { ROLE_KEYS } from '@/constants/app';
import { EXTRA_PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@/constants/permissions';
import { PHASE2B2_PERMISSION_KEYS } from '@/constants/phase2Permissions';
import type { SqlDatabase } from '../runtime';
import { permissionIdForKey, type Migration } from './001_initial';

const TABLES = `
CREATE TABLE IF NOT EXISTS patrol_points (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  location_note TEXT,
  latitude REAL,
  longitude REAL,
  gps_radius_meters REAL,
  require_qr INTEGER NOT NULL DEFAULT 1,
  require_gps INTEGER NOT NULL DEFAULT 0,
  require_photo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS patrol_templates (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  shift_template_id TEXT,
  schedule_mode TEXT NOT NULL DEFAULT 'daily' CHECK (schedule_mode IN ('daily', 'weekday', 'custom')),
  schedule_weekdays TEXT,
  custom_dates TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  effective_start_date TEXT NOT NULL,
  effective_end_date TEXT,
  allow_late_patrol INTEGER NOT NULL DEFAULT 0,
  enforce_sequence INTEGER NOT NULL DEFAULT 0,
  live_camera_only INTEGER NOT NULL DEFAULT 1,
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
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS patrol_template_points (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  patrol_template_id TEXT NOT NULL,
  patrol_point_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  window_start_time TEXT NOT NULL,
  window_end_time TEXT NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 1,
  require_qr_override INTEGER,
  require_gps_override INTEGER,
  require_photo_override INTEGER,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1,
  is_critical INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_template_id) REFERENCES patrol_templates(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_point_id) REFERENCES patrol_points(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (sequence_no >= 1),
  CHECK (required_count >= 1),
  CHECK (grace_minutes >= 0)
);

CREATE TABLE IF NOT EXISTS patrol_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  schedule_id TEXT,
  work_session_id TEXT,
  patrol_template_id TEXT NOT NULL,
  task_date TEXT NOT NULL,
  scheduled_start_at TEXT NOT NULL,
  scheduled_end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'partial', 'missed', 'cancelled')),
  total_points INTEGER NOT NULL DEFAULT 0,
  completed_points INTEGER NOT NULL DEFAULT 0,
  missed_points INTEGER NOT NULL DEFAULT 0,
  completion_rate REAL NOT NULL DEFAULT 0,
  template_name_snapshot TEXT NOT NULL,
  site_name_snapshot TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (schedule_id) REFERENCES work_schedules(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_template_id) REFERENCES patrol_templates(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (total_points >= 0),
  CHECK (completed_points >= 0),
  CHECK (missed_points >= 0)
);

CREATE TABLE IF NOT EXISTS patrol_task_points (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  patrol_task_id TEXT NOT NULL,
  patrol_point_id TEXT NOT NULL,
  point_name_snapshot TEXT NOT NULL,
  point_code_snapshot TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  window_start_at TEXT NOT NULL,
  window_end_at TEXT NOT NULL,
  require_qr INTEGER NOT NULL DEFAULT 0,
  require_gps INTEGER NOT NULL DEFAULT 0,
  require_photo INTEGER NOT NULL DEFAULT 0,
  gps_radius_meters_snapshot REAL,
  latitude_snapshot REAL,
  longitude_snapshot REAL,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1,
  is_critical INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'available', 'completed', 'late', 'missed', 'exception')),
  completed_at TEXT,
  missed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_id) REFERENCES patrol_tasks(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_point_id) REFERENCES patrol_points(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (window_end_at >= window_start_at)
);

CREATE TABLE IF NOT EXISTS patrol_check_records (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  patrol_task_id TEXT NOT NULL,
  patrol_task_point_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  qr_asset_id TEXT,
  qr_scan_log_id TEXT,
  latitude REAL,
  longitude REAL,
  distance_meters REAL,
  gps_accuracy REAL,
  gps_mocked INTEGER,
  photo_required INTEGER NOT NULL DEFAULT 0,
  photo_completed INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL CHECK (result IN ('success', 'late_success', 'exception', 'manual_override')),
  note TEXT,
  time_source TEXT NOT NULL DEFAULT 'device' CHECK (time_source IN ('device', 'server')),
  device_time TEXT NOT NULL,
  server_time TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_id) REFERENCES patrol_tasks(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_point_id) REFERENCES patrol_task_points(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (qr_asset_id) REFERENCES qr_assets(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (qr_scan_log_id) REFERENCES qr_scan_logs(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS patrol_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  patrol_task_id TEXT NOT NULL,
  patrol_task_point_id TEXT,
  local_uri TEXT NOT NULL,
  watermark_uri TEXT,
  captured_by TEXT,
  captured_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  device_id TEXT,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_id) REFERENCES patrol_tasks(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_point_id) REFERENCES patrol_task_points(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS patrol_exceptions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  patrol_task_id TEXT NOT NULL,
  patrol_task_point_id TEXT,
  reported_by TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('general', 'important', 'urgent', 'major')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processing', 'resolved')),
  reported_at TEXT NOT NULL,
  resolved_at TEXT,
  source_module TEXT NOT NULL DEFAULT 'patrol',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_id) REFERENCES patrol_tasks(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (patrol_task_point_id) REFERENCES patrol_task_points(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);
`;

const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_patrol_points_code
  ON patrol_points(tenant_id, site_id, code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patrol_points_site ON patrol_points(tenant_id, site_id, status);
CREATE INDEX IF NOT EXISTS idx_patrol_templates_site ON patrol_templates(tenant_id, site_id, status);
CREATE INDEX IF NOT EXISTS idx_patrol_template_points_tpl ON patrol_template_points(patrol_template_id, sequence_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patrol_tasks_schedule
  ON patrol_tasks(tenant_id, user_id, schedule_id, patrol_template_id)
  WHERE deleted_at IS NULL AND schedule_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patrol_tasks_session
  ON patrol_tasks(tenant_id, user_id, work_session_id, patrol_template_id)
  WHERE deleted_at IS NULL AND schedule_id IS NULL AND work_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_site ON patrol_tasks(tenant_id, site_id, task_date);
CREATE INDEX IF NOT EXISTS idx_patrol_task_points_task ON patrol_task_points(patrol_task_id, sequence_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patrol_check_success
  ON patrol_check_records(patrol_task_point_id)
  WHERE result IN ('success', 'late_success', 'manual_override');
CREATE INDEX IF NOT EXISTS idx_patrol_exceptions_site ON patrol_exceptions(tenant_id, site_id, status);
`;

export const migration006: Migration = {
  version: 6,
  name: '006_smart_patrol',
  up: async (db: SqlDatabase) => {
    await db.exec(TABLES);
    await db.exec(INDEXES);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE2B2_PERMISSION_KEYS) {
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
        await grant(role, PHASE2B2_PERMISSION_KEYS);
      } else if (role.role_key === ROLE_KEYS.STAFF) {
        await grant(
          role,
          STAFF_DEFAULT_PERMISSIONS.filter((key) => (PHASE2B2_PERMISSION_KEYS as readonly string[]).includes(key)),
        );
      }
    }
  },
};
