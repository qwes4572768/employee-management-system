export interface ActorContext {
  userId: string | null;
  fullName: string;
  account: string;
  roleSnapshot: string;
  tenantId: string | null;
  siteId: string | null;
  deviceId: string;
  appVersion: string;
}

export function systemActor(deviceId: string, appVersion: string): ActorContext {
  return {
    userId: null,
    fullName: '系統',
    account: 'system',
    roleSnapshot: 'SYSTEM',
    tenantId: null,
    siteId: null,
    deviceId,
    appVersion,
  };
}
