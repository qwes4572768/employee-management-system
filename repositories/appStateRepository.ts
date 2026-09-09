import { getDatabase } from '@/database/runtime';
import { nowIso } from '@/utils/datetime';

export async function getAppState(key: string): Promise<string | null> {
  const row = await getDatabase().getFirst<{ value: string | null }>(
    'SELECT value FROM app_state WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setAppState(key: string, value: string | null): Promise<void> {
  await getDatabase().run(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}
