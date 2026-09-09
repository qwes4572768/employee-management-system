export const DATABASE_BUSY_MESSAGE = '此系統已在另一個分頁開啟。請先關閉其他相同系統分頁，再按「重試」。既有資料不會被刪除。';

/** Keep the OPFS database owned by one tab for that tab's entire lifetime. */
export async function acquireWebDatabaseLock(name: string): Promise<() => void> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    // Older browsers still receive the friendly OPFS error in the initializer.
    return () => {};
  }
  return new Promise((resolve, reject) => {
    void navigator.locks.request(`app-database:${name}`, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        reject(new Error(DATABASE_BUSY_MESSAGE));
        return;
      }
      await new Promise<void>((release) => resolve(release));
    }).catch(reject);
  });
}

export function databaseInitializationError(error: unknown): Error {
  if (error instanceof Error && /NoModificationAllowedError|createSyncAccessHandle|Access Handles/.test(`${error.name} ${error.message}`)) {
    return new Error(DATABASE_BUSY_MESSAGE);
  }
  return error instanceof Error ? error : new Error('資料庫無法啟動，請重試。');
}
