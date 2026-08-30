import Database from 'better-sqlite3';

import type { RunResult, SqlDatabase, SqlParams } from './runtime';

function toArray(params?: SqlParams): unknown[] {
  if (!params) {
    return [];
  }
  if (Array.isArray(params)) {
    return params;
  }
  throw new Error('better-sqlite3 adapter currently expects positional parameters');
}

export function createBetterSqliteDatabase(filename = ':memory:'): SqlDatabase & { close: () => void } {
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  let depth = 0;

  const adapter: SqlDatabase & { close: () => void } = {
    async exec(sql: string) {
      db.exec(sql);
    },
    async run(sql: string, params?: SqlParams): Promise<RunResult> {
      const info = db.prepare(sql).run(...toArray(params));
      return {
        lastInsertRowId: Number(info.lastInsertRowid),
        changes: info.changes,
      };
    },
    async getFirst<T>(sql: string, params?: SqlParams): Promise<T | null> {
      const row = db.prepare(sql).get(...toArray(params)) as T | undefined;
      return row ?? null;
    },
    async getAll<T>(sql: string, params?: SqlParams): Promise<T[]> {
      return db.prepare(sql).all(...toArray(params)) as T[];
    },
    async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) {
        return fn();
      }
      db.exec('BEGIN');
      depth += 1;
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
    },
    close() {
      db.close();
    },
  };

  return adapter;
}
