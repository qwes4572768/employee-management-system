export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  getFirst<T>(sql: string, params?: SqlParams): Promise<T | null>;
  getAll<T>(sql: string, params?: SqlParams): Promise<T[]>;
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

let current: SqlDatabase | null = null;

export function setDatabase(db: SqlDatabase): void {
  current = db;
}

export function getDatabase(): SqlDatabase {
  if (!current) {
    throw new Error('資料庫尚未初始化');
  }
  return current;
}

export function hasDatabase(): boolean {
  return current !== null;
}
