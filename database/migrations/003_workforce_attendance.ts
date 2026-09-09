import { ROLE_KEYS } from '@/constants/app';
import { EXTRA_PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@/constants/permissions';
import { PHASE2A_PERMISSION_KEYS } from '@/constants/phase2Permissions';
import { permissionIdForKey } from './001_initial';

import type { SqlDatabase } from '../runtime';
import type { Migration } from './001_initial';

const TABLES = `
CREATE TABLE IF NOT EXISTS workforce_settings (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  minimum_rest_minutes INTEGER NOT NULL DEFAULT 480,
  late_grace_minutes INTEGER NOT NULL DEFAULT 5,
  early_leave_grace_minutes INTEGER NOT NULL DEFAULT 5,
  weekly_rest_mode TEXT NOT NULL DEFAULT 'standard_tw',
  jurisdiction_code TEXT NOT NULL DEFAULT 'TW',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS leave_policies (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL DEFAULT 'TW',
  annual_leave_recommended_advance_days INTEGER NOT NULL DEFAULT 30,
  personal_leave_recommended_advance_days INTEGER NOT NULL DEFAULT 30,
  sick_leave_document_due_hours INTEGER NOT NULL DEFAULT 72,
  preferred_day_off_monthly_limit INTEGER NOT NULL DEFAULT 2,
  personal_leave_monthly_interview_threshold INTEGER NOT NULL DEFAULT 3,
  personal_leave_annual_max_days INTEGER NOT NULL DEFAULT 14,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS shift_templates (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  crosses_midnight INTEGER NOT NULL DEFAULT 0,
  planned_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  starts_at TEXT,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS work_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shift_template_id TEXT,
  work_date TEXT NOT NULL,
  scheduled_start_at TEXT NOT NULL,
  scheduled_end_at TEXT NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (schedule_type IN ('normal', 'temporary', 'support', 'replacement', 'training')),
  staffing_mode_snapshot TEXT NOT NULL
    CHECK (staffing_mode_snapshot IN ('fixed', 'mobile', 'trainee')),
  allow_training_overlap INTEGER NOT NULL DEFAULT 0,
  trainer_user_id TEXT,
  training_reason TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),
  leave_status TEXT NOT NULL DEFAULT 'none'
    CHECK (leave_status IN ('none', 'leave_approved')),
  weekly_rest_warning INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  override_reason TEXT,
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
  FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (trainer_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (scheduled_end_at > scheduled_start_at)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  schedule_id TEXT,
  clock_in_at TEXT,
  clock_out_at TEXT,
  clock_in_latitude REAL,
  clock_in_longitude REAL,
  clock_out_latitude REAL,
  clock_out_longitude REAL,
  clock_in_distance_meters REAL,
  clock_out_distance_meters REAL,
  clock_in_method TEXT CHECK (clock_in_method IS NULL OR clock_in_method IN ('manual', 'gps', 'qr', 'gps_qr')),
  clock_out_method TEXT CHECK (clock_out_method IS NULL OR clock_out_method IN ('manual', 'gps', 'qr', 'gps_qr')),
  status TEXT NOT NULL DEFAULT 'normal'
    CHECK (status IN ('normal', 'late', 'early_leave', 'missing_clock_in', 'missing_clock_out', 'exception')),
  clock_in_note TEXT,
  clock_out_note TEXT,
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  attendance_id TEXT,
  schedule_id TEXT,
  request_type TEXT NOT NULL
    CHECK (request_type IN ('missing_in', 'missing_out', 'incorrect_time')),
  requested_clock_in_at TEXT,
  requested_clock_out_at TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  original_clock_in_at TEXT,
  original_clock_out_at TEXT,
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
  FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (schedule_id) REFERENCES work_schedules(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  schedule_id TEXT,
  attendance_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  start_method TEXT NOT NULL,
  end_method TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'forced_closed', 'cancelled')),
  unscheduled INTEGER NOT NULL DEFAULT 0,
  start_latitude REAL,
  start_longitude REAL,
  end_latitude REAL,
  end_longitude REAL,
  note TEXT,
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
  FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  entitlement_days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,
  pending_days REAL NOT NULL DEFAULT 0,
  remaining_days REAL NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  carryover_days REAL NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL
    CHECK (leave_type IN (
      'preferred_day_off', 'annual_leave', 'sick_leave',
      'bereavement_leave', 'personal_leave', 'official_leave'
    )),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'pending', 'approved', 'rejected', 'returned',
      'document_pending', 'document_overdue', 'interview_required', 'cancelled'
    )),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  is_urgent INTEGER NOT NULL DEFAULT 0,
  urgent_reason TEXT,
  hospitalized INTEGER NOT NULL DEFAULT 0,
  bereavement_relation TEXT,
  official_basis TEXT,
  document_status TEXT NOT NULL DEFAULT 'not_required_yet'
    CHECK (document_status IN (
      'not_required_yet', 'pending_document', 'submitted', 'verified', 'rejected', 'overdue'
    )),
  document_due_at TEXT,
  manager_interview_required INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS leave_request_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS leave_review_history (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS leave_interviews (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  interviewer_user_id TEXT NOT NULL,
  interviewed_at TEXT NOT NULL,
  content TEXT NOT NULL,
  result TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (interviewer_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS preferred_days_off (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  off_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS schedule_leave_links (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  leave_request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (schedule_id) REFERENCES work_schedules(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS app_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL,
  related_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_workforce_settings_tenant ON workforce_settings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_settings_tenant_live
  ON workforce_settings(tenant_id) WHERE deleted_at IS NULL AND site_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_policies_tenant ON leave_policies(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_policies_tenant_live
  ON leave_policies(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant ON shift_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_templates_site ON shift_templates(site_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_tenant ON work_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_user ON work_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_site_date ON work_schedules(site_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_schedules_user_start ON work_schedules(user_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_schedule ON attendance_records(schedule_id);
CREATE INDEX IF NOT EXISTS idx_correction_tenant ON attendance_correction_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_tenant ON work_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user ON work_sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_sessions_one_active
  ON work_sessions(tenant_id, user_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_user ON leave_balances(user_id, leave_type);
CREATE INDEX IF NOT EXISTS idx_preferred_days_off_user ON preferred_days_off(user_id, year_month);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications(user_id, created_at);
`;

export const migration003: Migration = {
  version: 3,
  name: '003_workforce_attendance',
  up: async (db: SqlDatabase) => {
    const cols = await db.getAll<{ name: string }>(`PRAGMA table_info(users)`);
    if (!cols.some((c) => c.name === 'staffing_mode')) {
      await db.exec(`ALTER TABLE users ADD COLUMN staffing_mode TEXT NOT NULL DEFAULT 'fixed'`);
    }

    await db.exec(TABLES);
    await db.exec(INDEXES);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE2A_PERMISSION_KEYS) {
      const extra = extraByKey.get(key);
      if (!extra) continue;
      await db.run(
        `INSERT OR IGNORE INTO permissions (id, perm_key, module, action, name, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [permissionIdForKey(key), extra.permKey, extra.module, extra.action, extra.name, extra.description],
      );
    }

    const tenants = await db.getAll<{ id: string }>(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
    for (const t of tenants) {
      await db.run(
        `INSERT OR IGNORE INTO workforce_settings (
          id, tenant_id, site_id, minimum_rest_minutes, late_grace_minutes, early_leave_grace_minutes,
          weekly_rest_mode, jurisdiction_code, created_at, updated_at, version, sync_status
        ) VALUES (?, ?, NULL, 480, 5, 5, 'standard_tw', 'TW', ?, ?, 1, 'local')`,
        [`ws-${t.id}`, t.id, now, now],
      );
      await db.run(
        `INSERT OR IGNORE INTO leave_policies (
          id, tenant_id, jurisdiction_code, annual_leave_recommended_advance_days,
          personal_leave_recommended_advance_days, sick_leave_document_due_hours,
          preferred_day_off_monthly_limit, personal_leave_monthly_interview_threshold,
          personal_leave_annual_max_days, created_at, updated_at, version, sync_status
        ) VALUES (?, ?, 'TW', 30, 30, 72, 2, 3, 14, ?, ?, 1, 'local')`,
        [`lp-${t.id}`, t.id, now, now],
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
        await grant(role, PHASE2A_PERMISSION_KEYS);
      } else if (role.role_key === ROLE_KEYS.STAFF) {
        await grant(
          role,
          STAFF_DEFAULT_PERMISSIONS.filter((key) => (PHASE2A_PERMISSION_KEYS as readonly string[]).includes(key)),
        );
      }
    }
  },
};
