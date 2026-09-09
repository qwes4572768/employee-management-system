import { ROLE_KEYS } from '@/constants/app';
import {
  DEFAULT_INSPECTION_POLICY,
  DEFAULT_MAJOR_CRITERIA,
  INSPECTION_CRITERIA_KEYS,
  INSPECTION_CRITERIA_LABELS,
} from '@/constants/inspection';
import { EXTRA_PERMISSIONS, STAFF_DEFAULT_PERMISSIONS } from '@/constants/permissions';
import { PHASE2C_PERMISSION_KEYS } from '@/constants/phase2Permissions';
import type { SqlDatabase } from '../runtime';
import { permissionIdForKey, type Migration } from './001_initial';

const TABLES = `
CREATE TABLE IF NOT EXISTS inspection_policies (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  excellent_min_score REAL NOT NULL DEFAULT 90,
  good_min_score REAL NOT NULL DEFAULT 80,
  pass_min_score REAL NOT NULL DEFAULT 70,
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

CREATE TABLE IF NOT EXISTS inspection_criteria (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  criteria_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  max_score REAL NOT NULL DEFAULT 5,
  weight REAL NOT NULL DEFAULT 10,
  required INTEGER NOT NULL DEFAULT 1,
  major_eligible INTEGER NOT NULL DEFAULT 0,
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1),
  CHECK (max_score > 0),
  CHECK (weight >= 0)
);

CREATE TABLE IF NOT EXISTS inspection_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  employee_user_id TEXT NOT NULL,
  inspector_user_id TEXT NOT NULL,
  employee_qr_asset_id TEXT,
  qr_scan_log_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  inspector_latitude REAL,
  inspector_longitude REAL,
  inspector_distance_meters REAL,
  remote_inspection_warning INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'normal' CHECK (verification_status IN ('normal', 'warning', 'exception')),
  schedule_id TEXT,
  attendance_id TEXT,
  work_session_id TEXT,
  employee_name_snapshot TEXT NOT NULL,
  employee_no_snapshot TEXT,
  job_title_snapshot TEXT,
  site_name_snapshot TEXT NOT NULL,
  inspector_name_snapshot TEXT NOT NULL,
  previous_inspection_id TEXT,
  reinspection_required INTEGER NOT NULL DEFAULT 0,
  reinspection_due_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'cancelled', 'voided')),
  void_reason TEXT,
  voided_by TEXT,
  voided_at TEXT,
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
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (inspector_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (employee_qr_asset_id) REFERENCES qr_assets(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (qr_scan_log_id) REFERENCES qr_scan_logs(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (previous_inspection_id) REFERENCES inspection_sessions(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS inspection_evaluations (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  inspection_session_id TEXT NOT NULL,
  employee_user_id TEXT NOT NULL,
  inspector_user_id TEXT NOT NULL,
  total_score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 0,
  weighted_score REAL NOT NULL DEFAULT 0,
  grade TEXT NOT NULL CHECK (grade IN ('excellent', 'good', 'pass', 'needs_improvement', 'serious_issue')),
  summary TEXT,
  major_deficiency INTEGER NOT NULL DEFAULT 0,
  revises_evaluation_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'voided')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (inspection_session_id) REFERENCES inspection_sessions(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (inspector_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (revises_evaluation_id) REFERENCES inspection_evaluations(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS inspection_evaluation_items (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  evaluation_id TEXT NOT NULL,
  criteria_id TEXT NOT NULL,
  criteria_key_snapshot TEXT NOT NULL,
  criteria_name_snapshot TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  weight REAL NOT NULL,
  comment TEXT,
  is_abnormal INTEGER NOT NULL DEFAULT 0,
  source_patrol_exception_id TEXT,
  source_patrol_task_point_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (evaluation_id) REFERENCES inspection_evaluations(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (criteria_id) REFERENCES inspection_criteria(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS inspection_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  inspection_session_id TEXT NOT NULL,
  evaluation_id TEXT,
  kind TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  watermark_uri TEXT,
  captured_by TEXT,
  captured_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (inspection_session_id) REFERENCES inspection_sessions(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (evaluation_id) REFERENCES inspection_evaluations(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS improvement_orders (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  employee_user_id TEXT NOT NULL,
  inspection_evaluation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('general', 'important', 'urgent')),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'submitted', 'verified', 'rejected', 'closed')),
  assigned_to TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (inspection_evaluation_id) REFERENCES inspection_evaluations(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS improvement_followups (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  improvement_order_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name_snapshot TEXT NOT NULL,
  action TEXT NOT NULL,
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
  FOREIGN KEY (improvement_order_id) REFERENCES improvement_orders(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS disciplinary_recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  inspection_evaluation_id TEXT,
  employee_user_id TEXT NOT NULL,
  recommended_by TEXT NOT NULL,
  action_key TEXT NOT NULL,
  action_label_snapshot TEXT NOT NULL,
  reason TEXT NOT NULL,
  compensation_claim_amount REAL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'returned', 'modified')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (inspection_evaluation_id) REFERENCES inspection_evaluations(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (recommended_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS disciplinary_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'returned', 'modified')),
  final_action TEXT,
  review_note TEXT,
  reviewed_at TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  device_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (recommendation_id) REFERENCES disciplinary_recommendations(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
);
`;

const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_policies_tenant
  ON inspection_policies(tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_criteria_key
  ON inspection_criteria(tenant_id, criteria_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inspection_sessions_site ON inspection_sessions(tenant_id, site_id, started_at);
CREATE INDEX IF NOT EXISTS idx_inspection_sessions_employee ON inspection_sessions(tenant_id, employee_user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_inspection_evaluations_session ON inspection_evaluations(inspection_session_id);
CREATE INDEX IF NOT EXISTS idx_improvement_orders_employee ON improvement_orders(tenant_id, employee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_discipline_pending ON disciplinary_recommendations(tenant_id, status);
`;

export const migration007: Migration = {
  version: 7,
  name: '007_inspection_evaluation',
  up: async (db: SqlDatabase) => {
    await db.exec(TABLES);
    await db.exec(INDEXES);

    const now = new Date().toISOString();
    const extraByKey = new Map(EXTRA_PERMISSIONS.map((item) => [item.permKey, item]));
    for (const key of PHASE2C_PERMISSION_KEYS) {
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
        await grant(role, PHASE2C_PERMISSION_KEYS);
      } else if (role.role_key === ROLE_KEYS.STAFF) {
        await grant(
          role,
          STAFF_DEFAULT_PERMISSIONS.filter((key) => (PHASE2C_PERMISSION_KEYS as readonly string[]).includes(key)),
        );
      }
    }

    const tenants = await db.getAll<{ id: string }>(`SELECT id FROM tenants WHERE deleted_at IS NULL`);
    for (const tenant of tenants) {
      await db.run(
        `INSERT OR IGNORE INTO inspection_policies (
          id, tenant_id, excellent_min_score, good_min_score, pass_min_score,
          created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, 'local', NULL)`,
        [
          `insp-policy-${tenant.id}`,
          tenant.id,
          DEFAULT_INSPECTION_POLICY.excellentMinScore,
          DEFAULT_INSPECTION_POLICY.goodMinScore,
          DEFAULT_INSPECTION_POLICY.passMinScore,
          now,
          now,
        ],
      );
      for (const [index, key] of INSPECTION_CRITERIA_KEYS.entries()) {
        await db.run(
          `INSERT OR IGNORE INTO inspection_criteria (
            id, tenant_id, criteria_key, display_name, max_score, weight, required, major_eligible,
            status, sort_order, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
          ) VALUES (?, ?, ?, ?, 5, 10, 1, ?, 'active', ?, NULL, ?, ?, NULL, 1, 'local', NULL)`,
          [
            `insp-crit-${tenant.id}-${key}`,
            tenant.id,
            key,
            INSPECTION_CRITERIA_LABELS[key],
            DEFAULT_MAJOR_CRITERIA.includes(key) ? 1 : 0,
            index + 1,
            now,
            now,
          ],
        );
      }
    }
  },
};
