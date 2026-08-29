import {
  QR_ASSET_TYPES,
  QR_SCAN_COOLDOWN_MS,
  QR_SCAN_RESULTS,
  type QrScanResult,
} from '@/constants/qr';
import { getQrAssetByCode, recordQrAssetScan } from '@/repositories/qrAssetRepository';
import { countQrScanLogsForCodeSince, insertQrScanLog, listQrScanLogs } from '@/repositories/qrScanLogRepository';
import { getTenantById } from '@/repositories/tenantRepository';
import { getUserById } from '@/repositories/userRepository';
import type { EmployeeQrProfile, QrAsset, QrScanLog, QrScanOutcome, SiteQrProfile } from '@/types';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { isQinGuanQrPayload } from '@/utils/qrPayload';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { DUTY_STATUS_LABELS, getPersonDutyCard } from './dashboardService';
import { getLocationProvider } from './locationProvider';
import { actorCanAccessSite, actorCanAccessTargetUser } from './qrAssetService';
import { getAuthorizedSites } from './siteService';
import { getSiteById } from '@/repositories/siteRepository';
import { requireActorTenant } from './tenantGuard';

export type CameraPermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked' | 'unavailable';

const lastHandled = new Map<string, number>();

export function resetQrScanCooldown(): void {
  lastHandled.clear();
}

function cooldownKey(actor: ActorContext, code: string): string {
  return `${actor.tenantId ?? ''}:${actor.userId ?? ''}:${code}`;
}

export async function getCameraPermissionState(): Promise<CameraPermissionState> {
  try {
    const Camera = await import('expo-camera');
    const existing = await Camera.Camera.getCameraPermissionsAsync();
    if (existing.status === Camera.PermissionStatus.UNDETERMINED) return 'undetermined';
    if (existing.status === Camera.PermissionStatus.GRANTED) return 'granted';
    return existing.canAskAgain === false ? 'blocked' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function requestCameraPermission(): Promise<CameraPermissionState> {
  try {
    const Camera = await import('expo-camera');
    const asked = await Camera.Camera.requestCameraPermissionsAsync();
    if (asked.status === Camera.PermissionStatus.GRANTED) return 'granted';
    return asked.canAskAgain === false ? 'blocked' : 'denied';
  } catch {
    return 'unavailable';
  }
}

async function optionalFix(): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const result = await getLocationProvider().getCurrentPosition();
    if (result.ok) {
      return { latitude: result.fix.latitude, longitude: result.fix.longitude };
    }
  } catch {
    // GPS is optional for identification scans.
  }
  return { latitude: null, longitude: null };
}

async function buildEmployeeProfile(tenantId: string, userId: string, at: Date): Promise<EmployeeQrProfile | null> {
  const user = await getUserById(userId, tenantId);
  if (!user) return null;
  const tenant = await getTenantById(tenantId);
  const card = await getPersonDutyCard(tenantId, user.id, at);
  const sites = await getAuthorizedSites(user);
  return {
    userId: user.id,
    photoUri: user.photoUri,
    fullName: user.fullName,
    employeeNo: user.employeeNo,
    gender: user.gender,
    hireDate: user.hireDate,
    jobTitle: user.jobTitle,
    companyName: tenant?.officialName ?? null,
    authorizedSiteNames: sites.map((site) => site.name),
    dutyStatus: card?.status ?? null,
    dutyStatusLabel: card ? DUTY_STATUS_LABELS[card.status] : null,
    todayShiftName: card?.shiftName ?? null,
    currentSiteName: card?.site?.name ?? null,
    clockedIn: Boolean(card?.attendance?.clockInAt),
    onDuty: card?.session?.status === 'active',
  };
}

async function buildSiteProfile(asset: QrAsset): Promise<SiteQrProfile | null> {
  const site = await getSiteById(asset.targetId, asset.tenantId);
  if (!site) return null;
  const creator = asset.createdBy ? await getUserById(asset.createdBy, asset.tenantId) : null;
  return {
    siteId: site.id,
    name: site.name,
    siteCode: site.siteCode,
    status: site.status,
    createdByName: creator?.fullName ?? null,
    createdAt: asset.createdAt,
    lastScanAt: asset.lastScanAt,
  };
}

async function writeScan(input: {
  actor: ActorContext;
  tenantId: string;
  code: string;
  result: QrScanResult;
  asset?: QrAsset | null;
  siteId?: string | null;
  at: string;
  lat: number | null;
  lng: number | null;
}): Promise<QrScanLog> {
  return insertQrScanLog({
    tenantId: input.tenantId,
    siteId: input.siteId ?? input.actor.siteId ?? input.asset?.siteId ?? null,
    qrAssetId: input.asset?.id ?? null,
    scannerUserId: input.actor.userId,
    scannerNameSnapshot: input.actor.fullName,
    scannerRoleSnapshot: input.actor.roleSnapshot,
    scannedCode: input.code,
    scanResult: input.result,
    scannedAt: input.at,
    latitude: input.lat,
    longitude: input.lng,
    deviceId: input.actor.deviceId,
    appVersion: input.actor.appVersion,
  });
}

async function maybeAuditScan(actor: ActorContext, result: QrScanResult, message: string, assetId?: string | null) {
  if (
    result !== QR_SCAN_RESULTS.VALID &&
    result !== QR_SCAN_RESULTS.UNAUTHORIZED &&
    result !== QR_SCAN_RESULTS.CROSS_TENANT &&
    result !== QR_SCAN_RESULTS.INACTIVE
  ) {
    return;
  }
  await writeAudit({
    actor,
    action: 'scan',
    module: 'qrScan',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} ${message}`,
    targetType: 'qr_scan',
    targetId: assetId ?? null,
    result: result === QR_SCAN_RESULTS.VALID ? 'success' : 'failure',
  });
}

export async function scanQr(
  actor: ActorContext,
  rawCode: string,
  input?: { at?: Date; skipCooldown?: boolean },
): Promise<QrScanOutcome> {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'qrScan.use');
  const code = rawCode.trim();
  const atDate = input?.at ?? new Date();
  const at = atDate.toISOString();
  const empty = (
    result: QrScanResult,
    message: string,
    log: QrScanLog | null,
    extra?: Partial<QrScanOutcome>,
  ): QrScanOutcome => ({
    scanResult: result,
    message,
    log,
    debounced: false,
    asset: null,
    employee: null,
    site: null,
    deactivatedAt: null,
    ...extra,
  });

  if (!code) {
    const { latitude, longitude } = await optionalFix();
    const log = await writeScan({
      actor,
      tenantId,
      code: '',
      result: QR_SCAN_RESULTS.INVALID,
      at,
      lat: latitude,
      lng: longitude,
    });
    return empty(QR_SCAN_RESULTS.INVALID, '無法識別此 QR', log);
  }

  const key = cooldownKey(actor, code);
  if (!input?.skipCooldown && actor.userId) {
    const memoryLast = lastHandled.get(key);
    const since = new Date(atDate.getTime() - QR_SCAN_COOLDOWN_MS).toISOString();
    const recent = await countQrScanLogsForCodeSince(tenantId, actor.userId, code, since);
    if ((memoryLast != null && atDate.getTime() - memoryLast < QR_SCAN_COOLDOWN_MS) || recent > 0) {
      lastHandled.set(key, atDate.getTime());
      return empty(QR_SCAN_RESULTS.INVALID, '請稍候再掃描', null, { debounced: true });
    }
  }

  const { latitude, longitude } = await optionalFix();

  if (!isQinGuanQrPayload(code)) {
    const log = await writeScan({
      actor,
      tenantId,
      code,
      result: QR_SCAN_RESULTS.INVALID,
      at,
      lat: latitude,
      lng: longitude,
    });
    lastHandled.set(key, atDate.getTime());
    return empty(QR_SCAN_RESULTS.INVALID, '此 QR 不是勤管系統資產', log);
  }

  const asset = await getQrAssetByCode(code);
  if (!asset) {
    const log = await writeScan({
      actor,
      tenantId,
      code,
      result: QR_SCAN_RESULTS.INVALID,
      at,
      lat: latitude,
      lng: longitude,
    });
    lastHandled.set(key, atDate.getTime());
    return empty(QR_SCAN_RESULTS.INVALID, '無法識別此 QR', log);
  }

  if (asset.tenantId !== tenantId) {
    const log = await writeScan({
      actor,
      tenantId,
      code,
      result: QR_SCAN_RESULTS.CROSS_TENANT,
      at,
      lat: latitude,
      lng: longitude,
    });
    lastHandled.set(key, atDate.getTime());
    await maybeAuditScan(actor, QR_SCAN_RESULTS.CROSS_TENANT, '掃描到不屬於目前公司的 QR', null);
    return empty(QR_SCAN_RESULTS.CROSS_TENANT, '此 QR 不屬於目前公司', log);
  }

  if (asset.status === 'inactive') {
    const log = await writeScan({
      actor,
      tenantId,
      code,
      result: QR_SCAN_RESULTS.INACTIVE,
      asset,
      at,
      lat: latitude,
      lng: longitude,
    });
    await recordQrAssetScan(asset.id, tenantId, at);
    lastHandled.set(key, atDate.getTime());
    await maybeAuditScan(actor, QR_SCAN_RESULTS.INACTIVE, `掃描已停用的 QR「${asset.displayName}」`, asset.id);
    return empty(QR_SCAN_RESULTS.INACTIVE, '此 QR 已停用', log, {
      deactivatedAt: asset.deactivatedAt,
    });
  }

  if (asset.assetType === QR_ASSET_TYPES.EMPLOYEE) {
    const target = await getUserById(asset.targetId, tenantId);
    if (!target) {
      const log = await writeScan({
        actor,
        tenantId,
        code,
        result: QR_SCAN_RESULTS.INVALID,
        asset,
        at,
        lat: latitude,
        lng: longitude,
      });
      lastHandled.set(key, atDate.getTime());
      return empty(QR_SCAN_RESULTS.INVALID, '無法識別此 QR', log);
    }
    const allowed = await actorCanAccessTargetUser(actor, target);
    if (!allowed) {
      const log = await writeScan({
        actor,
        tenantId,
        code,
        result: QR_SCAN_RESULTS.UNAUTHORIZED,
        asset,
        at,
        lat: latitude,
        lng: longitude,
      });
      await recordQrAssetScan(asset.id, tenantId, at);
      lastHandled.set(key, atDate.getTime());
      await maybeAuditScan(actor, QR_SCAN_RESULTS.UNAUTHORIZED, '掃描人員 QR 但沒有查看權限', asset.id);
      return empty(QR_SCAN_RESULTS.UNAUTHORIZED, '您沒有權限查看此人員', log);
    }
    const employee = await buildEmployeeProfile(tenantId, target.id, atDate);
    const log = await writeScan({
      actor,
      tenantId,
      code,
      result: QR_SCAN_RESULTS.VALID,
      asset,
      at,
      lat: latitude,
      lng: longitude,
    });
    await recordQrAssetScan(asset.id, tenantId, at);
    lastHandled.set(key, atDate.getTime());
    await maybeAuditScan(actor, QR_SCAN_RESULTS.VALID, `掃描人員 QR「${asset.displayName}」`, asset.id);
    return {
      scanResult: QR_SCAN_RESULTS.VALID,
      message: '掃描成功',
      log,
      debounced: false,
      asset,
      employee,
      site: null,
      deactivatedAt: null,
    };
  }

  if (asset.assetType === QR_ASSET_TYPES.SITE) {
    const allowed = await actorCanAccessSite(actor, asset.targetId);
    if (!allowed) {
      const log = await writeScan({
        actor,
        tenantId,
        code,
        result: QR_SCAN_RESULTS.UNAUTHORIZED,
        asset,
        at,
        lat: latitude,
        lng: longitude,
      });
      await recordQrAssetScan(asset.id, tenantId, at);
      lastHandled.set(key, atDate.getTime());
      await maybeAuditScan(actor, QR_SCAN_RESULTS.UNAUTHORIZED, '掃描案場 QR 但沒有查看權限', asset.id);
      return empty(QR_SCAN_RESULTS.UNAUTHORIZED, '您沒有權限查看此資產', log);
    }
    const site = await buildSiteProfile(asset);
    const log = await writeScan({
      actor,
      tenantId,
      code,
      result: QR_SCAN_RESULTS.VALID,
      asset,
      siteId: asset.targetId,
      at,
      lat: latitude,
      lng: longitude,
    });
    await recordQrAssetScan(asset.id, tenantId, at);
    lastHandled.set(key, atDate.getTime());
    await maybeAuditScan(actor, QR_SCAN_RESULTS.VALID, `掃描案場 QR「${asset.displayName}」`, asset.id);
    return {
      scanResult: QR_SCAN_RESULTS.VALID,
      message: '掃描成功',
      log,
      debounced: false,
      asset,
      employee: null,
      site,
      deactivatedAt: null,
    };
  }

  const log = await writeScan({
    actor,
    tenantId,
    code,
    result: QR_SCAN_RESULTS.VALID,
    asset,
    at,
    lat: latitude,
    lng: longitude,
  });
  await recordQrAssetScan(asset.id, tenantId, at);
  lastHandled.set(key, atDate.getTime());
  return {
    scanResult: QR_SCAN_RESULTS.VALID,
    message: `${asset.displayName} 已識別，完整作業將於後續階段開放`,
    log,
    debounced: false,
    asset,
    employee: null,
    site: null,
    deactivatedAt: null,
  };
}

export async function listScanHistory(actor: ActorContext) {
  const tenantId = requireActorTenant(actor);
  await requireActorPermission(actor, 'qrScan.viewHistory');
  return listQrScanLogs(tenantId);
}
