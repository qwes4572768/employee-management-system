import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { initializeAppDatabase } from '@/database/client';
import { countTenants, getTenantById } from '@/repositories/tenantRepository';
import { getUserById } from '@/repositories/userRepository';
import { getEffectivePermissionKeys, getEffectiveRoles, roleSnapshotForUser } from '@/services/permissionService';
import {
  clearSession,
  configureKvStore,
  getAppVersion,
  getDeviceId,
  loadSession,
  type KvStore,
} from '@/services/sessionStore';
import { getAuthorizedSites, getCurrentSite, switchCurrentSite } from '@/services/siteService';
import type { ActorContext } from '@/services/actor';
import type { Role, SessionPayload, Site, Tenant, User } from '@/types';

export interface SessionContextValue {
  ready: boolean;
  bootstrapComplete: boolean;
  session: SessionPayload | null;
  user: User | null;
  tenant: Tenant | null;
  roles: Role[];
  permissionKeys: string[];
  currentSite: Site | null;
  authorizedSites: Site[];
  actor: ActorContext;
  can: (permKey: string) => boolean;
  refresh: () => Promise<void>;
  selectSite: (siteId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const memoryFallback = new Map<string, string>();

const deviceKv: KvStore = {
  async get(key) {
    try {
      if (Platform.OS === 'web') {
        return globalThis.localStorage?.getItem(key) ?? memoryFallback.get(key) ?? null;
      }
      return (await SecureStore.getItemAsync(key)) ?? memoryFallback.get(key) ?? null;
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },
  async set(key, value) {
    memoryFallback.set(key, value);
    try {
      if (Platform.OS === 'web') {
        globalThis.localStorage?.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Keep the in-memory copy so the current session still works.
    }
  },
  async delete(key) {
    memoryFallback.delete(key);
    try {
      if (Platform.OS === 'web') {
        globalThis.localStorage?.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore storage failures after the in-memory value is cleared.
    }
  },
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bootstrapComplete, setBootstrapComplete] = useState(false);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [authorizedSites, setAuthorizedSites] = useState<Site[]>([]);
  const [actor, setActor] = useState<ActorContext>({
    userId: null,
    fullName: '系統',
    account: 'system',
    roleSnapshot: 'SYSTEM',
    tenantId: null,
    siteId: null,
    deviceId: 'unknown',
    appVersion: '1.0.0',
  });

  const refresh = useCallback(async () => {
    configureKvStore(deviceKv);
    await initializeAppDatabase();
    const deviceId = await getDeviceId();
    const appVersion = await getAppVersion();
    const complete = (await countTenants()) > 0;
    setBootstrapComplete(complete);
    const loaded = await loadSession();
    if (!loaded) {
      setSession(null);
      setUser(null);
      setTenant(null);
      setRoles([]);
      setPermissionKeys([]);
      setCurrentSite(null);
      setAuthorizedSites([]);
      setActor({
        userId: null,
        fullName: '系統',
        account: 'system',
        roleSnapshot: 'SYSTEM',
        tenantId: null,
        siteId: null,
        deviceId,
        appVersion,
      });
      setReady(true);
      return;
    }
    const nextUser = await getUserById(loaded.userId, loaded.tenantId);
    if (!nextUser || nextUser.status !== 'active' || nextUser.tenantId !== loaded.tenantId) {
      await clearSession();
      setSession(null);
      setUser(nextUser);
      setReady(true);
      return;
    }
    const nextTenant = await getTenantById(nextUser.tenantId);
    const nextRoles = await getEffectiveRoles(nextUser.id, nextUser.tenantId);
    const keys = await getEffectivePermissionKeys(nextUser);
    const sites = await getAuthorizedSites(nextUser);
    const site = await getCurrentSite(nextUser);
    const snapshot = await roleSnapshotForUser(nextUser.id, nextUser.tenantId);
    setSession(loaded);
    setUser(nextUser);
    setTenant(nextTenant);
    setRoles(nextRoles);
    setPermissionKeys(keys);
    setAuthorizedSites(sites);
    setCurrentSite(site);
    setActor({
      userId: nextUser.id,
      fullName: nextUser.fullName,
      account: nextUser.account,
      roleSnapshot: snapshot,
      tenantId: nextUser.tenantId,
      siteId: site?.id ?? null,
      deviceId,
      appVersion,
    });
    setReady(true);
  }, []);

  const selectSite = useCallback(
    async (siteId: string) => {
      if (!user) {
        return;
      }
      const site = await switchCurrentSite(user, siteId);
      setCurrentSite(site);
      setActor((prev) => ({ ...prev, siteId: site.id }));
    },
    [user],
  );

  const can = useCallback((permKey: string) => permissionKeys.includes(permKey), [permissionKeys]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ready,
      bootstrapComplete,
      session,
      user,
      tenant,
      roles,
      permissionKeys,
      currentSite,
      authorizedSites,
      actor,
      can,
      refresh,
      selectSite,
    }),
    [
      ready,
      bootstrapComplete,
      session,
      user,
      tenant,
      roles,
      permissionKeys,
      currentSite,
      authorizedSites,
      actor,
      can,
      refresh,
      selectSite,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('SessionProvider 尚未就緒');
  }
  return ctx;
}
