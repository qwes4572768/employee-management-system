import * as SQLite from 'expo-sqlite';

import { DATABASE_NAME } from '@/constants/app';

import { createExpoDatabase } from './expoAdapter';
import { migrate } from './migrate';
import { setDatabase, type SqlDatabase } from './runtime';

let opening: Promise<SqlDatabase> | null = null;

export async function initializeAppDatabase(): Promise<SqlDatabase> {
  if (opening) {
    return opening;
  }
  opening = (async () => {
    const native = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await native.execAsync('PRAGMA foreign_keys = ON;');
    await native.execAsync('PRAGMA journal_mode = WAL;');
    const db = createExpoDatabase(native);
    await migrate(db);
    setDatabase(db);
    return db;
  })();
  return opening;
}
