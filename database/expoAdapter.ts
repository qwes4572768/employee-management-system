import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import type { RunResult, SqlDatabase, SqlParams } from './runtime';

function toBindParams(params?: SqlParams): SQLiteBindValue[] | Record<string, SQLiteBindValue> {
  if (!params) {
    return [];
  }
  if (Array.isArray(params)) {
    return params as SQLiteBindValue[];
  }
  return params as Record<string, SQLiteBindValue>;
}

export function createExpoDatabase(db: SQLiteDatabase): SqlDatabase {
  return {
    async exec(sql: string) {
      await db.execAsync(sql);
    },
    async run(sql: string, params?: SqlParams): Promise<RunResult> {
      const result = await db.runAsync(sql, toBindParams(params));
      return {
        lastInsertRowId: result.lastInsertRowId,
        changes: result.changes,
      };
    },
    async getFirst<T>(sql: string, params?: SqlParams): Promise<T | null> {
      const row = await db.getFirstAsync<T>(sql, toBindParams(params));
      return row ?? null;
    },
    async getAll<T>(sql: string, params?: SqlParams): Promise<T[]> {
      return db.getAllAsync<T>(sql, toBindParams(params));
    },
    async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
      let value: T | undefined;
      await db.withTransactionAsync(async () => {
        value = await fn();
      });
      return value as T;
    },
  };
}
