import { migrations } from './migrations';
import type { SqlDatabase } from './runtime';

interface MigrationRow {
  version: number;
}

interface ForeignKeyViolation {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
}

async function assertNoFkViolations(db: SqlDatabase): Promise<void> {
  const rows = await db.getAll<ForeignKeyViolation>('PRAGMA foreign_key_check');
  if (rows.length > 0) {
    const detail = rows
      .slice(0, 8)
      .map((row) => `${row.table}(rowid=${row.rowid}) → ${row.parent}`)
      .join('; ');
    throw new Error(`外鍵檢查失敗，migration 已中止：${detail}`);
  }
}

export async function migrate(db: SqlDatabase): Promise<number> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await db.getAll<MigrationRow>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const appliedSet = new Set(applied.map((row) => row.version));
  let latest = applied.reduce((max, row) => Math.max(max, row.version), 0);

  const pending = migrations.filter((item) => !appliedSet.has(item.version));
  pending.sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
      await db.withTransaction(async () => {
        if (typeof migration.up === 'function') {
          await migration.up(db);
        } else {
          await db.exec(migration.up);
        }
        await db.run(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, new Date().toISOString()],
        );
        await assertNoFkViolations(db);
      });
    } finally {
      await db.exec('PRAGMA foreign_keys = ON;');
    }
    latest = migration.version;
  }

  await db.exec('PRAGMA foreign_keys = ON;');
  return latest;
}

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirst<MigrationRow>(
    'SELECT MAX(version) as version FROM schema_migrations',
  );
  return row?.version ?? 0;
}

export async function isForeignKeysEnabled(db: SqlDatabase): Promise<boolean> {
  const row = await db.getFirst<{ foreign_keys: number }>('PRAGMA foreign_keys');
  return row?.foreign_keys === 1;
}
