import { migrations } from './migrations';
import type { SqlDatabase } from './runtime';

interface MigrationRow {
  version: number;
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
    await db.withTransaction(async () => {
      await db.exec(migration.up);
      await db.run(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, new Date().toISOString()],
      );
    });
    latest = migration.version;
  }

  return latest;
}

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirst<MigrationRow>(
    'SELECT MAX(version) as version FROM schema_migrations',
  );
  return row?.version ?? 0;
}
