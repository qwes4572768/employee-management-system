import { APP_VERSION, DEVICE_ID_KEY, SESSION_STORE_KEY, SESSION_TTL_MS } from '@/constants/app';
import type { SessionPayload } from '@/types';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/datetime';

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryKvStore implements KvStore {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

let store: KvStore = new MemoryKvStore();
let cachedDeviceId: string | null = null;

export function configureKvStore(next: KvStore): void {
  store = next;
  cachedDeviceId = null;
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  const existing = await store.get(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  const created = createId();
  await store.set(DEVICE_ID_KEY, created);
  cachedDeviceId = created;
  return created;
}

export async function getAppVersion(): Promise<string> {
  return APP_VERSION;
}

export async function saveSession(payload: SessionPayload): Promise<void> {
  await store.set(SESSION_STORE_KEY, JSON.stringify(payload));
}

export async function loadSession(): Promise<SessionPayload | null> {
  const raw = await store.get(SESSION_STORE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SessionPayload;
    if (!parsed.userId || !parsed.expiresAt) {
      return null;
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await store.delete(SESSION_STORE_KEY);
}

export function createSession(userId: string, tenantId: string): SessionPayload {
  return {
    sessionToken: createId(),
    userId,
    tenantId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
}

export async function actorDeviceMeta() {
  return {
    deviceId: await getDeviceId(),
    appVersion: await getAppVersion(),
    at: nowIso(),
  };
}
