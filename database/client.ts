import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { DATABASE_NAME } from '@/constants/app';

import { createExpoDatabase } from './expoAdapter';
import { migrate } from './migrate';
import { setDatabase, type SqlDatabase } from './runtime';
import { acquireWebDatabaseLock, databaseInitializationError } from './webDatabaseLock';
import { createRetryableInitializer } from './retryableInitializer';

// Fast Refresh re-evaluates modules without closing SQLite's worker or releasing
// this tab's Web Lock. Keep the initializer with the tab, not the module.
const databaseGlobal = globalThis as typeof globalThis & {
  __qinguanDatabaseInitializers?: Map<string, () => Promise<SqlDatabase>>;
};
const initializers = databaseGlobal.__qinguanDatabaseInitializers ??= new Map();

const openDatabase = initializers.get(DATABASE_NAME) ?? createRetryableInitializer<SqlDatabase>(async () => {
  let release: (() => void) | undefined;
  let native: SQLite.SQLiteDatabase | undefined;
  try {
    if (Platform.OS === 'web') release = await acquireWebDatabaseLock(DATABASE_NAME);
    native = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await native.execAsync('PRAGMA foreign_keys = ON;');
    await native.execAsync('PRAGMA journal_mode = WAL;');
    const db = createExpoDatabase(native);
    await migrate(db);
    setDatabase(db);
    return db;
  } catch (error) {
    if (native) await native.closeAsync().catch(() => {});
    release?.();
    throw databaseInitializationError(error);
  }
});
initializers.set(DATABASE_NAME, openDatabase);

export async function initializeAppDatabase(): Promise<SqlDatabase> {
  const db = await openDatabase();
  // runtime.ts itself may also have been refreshed.
  setDatabase(db);
  return db;
}
