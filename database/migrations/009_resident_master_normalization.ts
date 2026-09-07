import type { SqlDatabase } from '../runtime';
import type { Migration } from './001_initial';

const RESIDENTS_CREATE = `
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  gender TEXT NOT NULL DEFAULT 'unspecified',
  id_last4 TEXT,
  photo_uri TEXT,
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
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (version >= 1)
`;

const RESIDENTS_COLS = `id, tenant_id, site_id, full_name, phone, gender, id_last4, photo_uri,
  move_in_at, move_out_at, status, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id`;

const TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS trg_visitor_movements_no_update
BEFORE UPDATE ON visitor_movements
BEGIN
  SELECT RAISE(ABORT, '訪客進出紀錄僅能新增，不可修改或刪除');
END;

CREATE TRIGGER IF NOT EXISTS trg_visitor_movements_no_delete
BEFORE DELETE ON visitor_movements
BEGIN
  SELECT RAISE(ABORT, '訪客進出紀錄僅能新增，不可修改或刪除');
END;

CREATE TRIGGER IF NOT EXISTS trg_parcel_events_no_update
BEFORE UPDATE ON parcel_events
BEGIN
  SELECT RAISE(ABORT, '包裹事件僅能新增，不可修改或刪除');
END;

CREATE TRIGGER IF NOT EXISTS trg_parcel_events_no_delete
BEFORE DELETE ON parcel_events
BEGIN
  SELECT RAISE(ABORT, '包裹事件僅能新增，不可修改或刪除');
END;
`;

export const migration009: Migration = {
  version: 9,
  name: '009_resident_master_normalization',
  up: async (db: SqlDatabase) => {
    const missing = await db.getAll<{ id: string; full_name: string }>(
      `SELECT r.id, r.full_name
       FROM residents r
       WHERE r.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM resident_occupancies o
           WHERE o.resident_id = r.id AND o.deleted_at IS NULL
         )`,
    );
    if (missing.length > 0) {
      const names = missing.map((item) => item.full_name).join('、');
      throw new Error(
        `住戶主檔正規化失敗：以下住戶沒有 occupancy 關係，系統不能自行猜測關係：${names}`,
      );
    }

    const occupancyCols = await db.getAll<{ name: string }>('PRAGMA table_info(resident_occupancies)');
    if (!occupancyCols.some((item) => item.name === 'is_primary')) {
      await db.exec('ALTER TABLE resident_occupancies ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0');
    }
    await db.exec(`
      UPDATE resident_occupancies
      SET is_primary = 1
      WHERE deleted_at IS NULL
        AND is_current = 1
        AND id IN (
          SELECT o.id
          FROM resident_occupancies o
          INNER JOIN residents r ON r.id = o.resident_id
          WHERE r.is_primary = 1 AND o.unit_id = r.unit_id
        )
    `);

    await db.exec(`
      CREATE TABLE residents__new (
        ${RESIDENTS_CREATE}
      );
      INSERT INTO residents__new (${RESIDENTS_COLS})
      SELECT ${RESIDENTS_COLS} FROM residents;
      DROP TABLE residents;
      ALTER TABLE residents__new RENAME TO residents;
    `);
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_residents_site ON residents(tenant_id, site_id, status);
      CREATE INDEX IF NOT EXISTS idx_occupancies_unit_current
        ON resident_occupancies(tenant_id, unit_id, resident_id, is_current);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_occupancies_current_unique
        ON resident_occupancies(tenant_id, resident_id, unit_id, relation_key)
        WHERE deleted_at IS NULL AND is_current = 1;
    `);

    const movementCols = await db.getAll<{ name: string }>('PRAGMA table_info(visitor_movements)');
    if (!movementCols.some((item) => item.name === 'event_kind')) {
      await db.exec(`ALTER TABLE visitor_movements ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'movement'`);
    }
    if (!movementCols.some((item) => item.name === 'corrects_id')) {
      await db.exec('ALTER TABLE visitor_movements ADD COLUMN corrects_id TEXT');
    }
    if (!movementCols.some((item) => item.name === 'reason')) {
      await db.exec('ALTER TABLE visitor_movements ADD COLUMN reason TEXT');
    }

    const eventCols = await db.getAll<{ name: string }>('PRAGMA table_info(parcel_events)');
    if (!eventCols.some((item) => item.name === 'corrects_event_id')) {
      await db.exec('ALTER TABLE parcel_events ADD COLUMN corrects_event_id TEXT');
    }
    if (!eventCols.some((item) => item.name === 'reason')) {
      await db.exec('ALTER TABLE parcel_events ADD COLUMN reason TEXT');
    }

    await db.exec(TRIGGERS);
  },
};
