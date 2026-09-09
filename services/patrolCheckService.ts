import { PATROL_CHECK_RESULTS, PATROL_POINT_LIVE_STATUSES } from '@/constants/patrol';
import { QR_ASSET_TYPES, QR_SCAN_RESULTS } from '@/constants/qr';
import { insertPatrolCheckRecord, insertPatrolEvidence, listPatrolEvidenceForPoint } from '@/repositories/patrolCheckRepository';
import { updatePatrolTaskPointState } from '@/repositories/patrolTaskRepository';
import { getQrAssetByCode, recordQrAssetScan } from '@/repositories/qrAssetRepository';
import { insertQrScanLog } from '@/repositories/qrScanLogRepository';
import { getPatrolTemplateById } from '@/repositories/patrolTemplateRepository';
import type { PatrolCheckRecord, PatrolEvidence } from '@/types';
import { haversineMeters, isValidCoordinate } from '@/utils/geo';
import { formatDateTimeZh } from '@/utils/datetime';
import { isQinGuanQrPayload } from '@/utils/qrPayload';
import { required } from '@/utils/validation';

import { requireActorPermission } from './access';
import type { ActorContext } from './actor';
import { writeAudit } from './auditService';
import { getLocationProvider } from './locationProvider';
import { createPatrolException } from './patrolExceptionService';
import { applyPatrolWatermark } from './patrolWatermarkService';
import {
  assertCanExecutePoint,
  refreshPatrolTask,
  requirePatrolTask,
  requirePatrolTaskPoint,
} from './patrolTaskService';
import { requireActorTenant } from './tenantGuard';

async function optionalFix(input?: {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  mocked?: boolean | null;
}) {
  if (input?.latitude != null && input.longitude != null) {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
      mocked: input.mocked ?? null,
    };
  }
  try {
    const result = await getLocationProvider().getCurrentPosition();
    if (result.ok) {
      return {
        latitude: result.fix.latitude,
        longitude: result.fix.longitude,
        accuracy: result.fix.accuracy ?? null,
        mocked: result.fix.mocked ?? null,
      };
    }
  } catch {
    // GPS is optional unless required.
  }
  return { latitude: null, longitude: null, accuracy: null, mocked: null };
}

export async function completePatrolPoint(
  actor: ActorContext,
  taskPointId: string,
  input?: {
    qrCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    accuracy?: number | null;
    mocked?: boolean | null;
    photoLocalUri?: string | null;
    note?: string | null;
    at?: Date;
    manualOverride?: { reason: string; description: string } | null;
  },
): Promise<{ check: PatrolCheckRecord; evidence: PatrolEvidence | null }> {
  const tenantId = requireActorTenant(actor);
  if (!actor.userId) throw new Error('缺少操作者');
  const atDate = input?.at ?? new Date();
  const at = atDate.toISOString();
  const point = await requirePatrolTaskPoint(taskPointId, tenantId);
  const task = await requirePatrolTask(point.patrolTaskId, tenantId);
  const override = Boolean(input?.manualOverride);
  if (override) {
    await requireActorPermission(actor, 'patrol.manualOverride');
    const reasonError = required(input?.manualOverride?.reason ?? '', '補登原因');
    const descError = required(input?.manualOverride?.description ?? '', '補登說明');
    if (reasonError || descError) throw new Error(reasonError ?? descError ?? '補登資料不完整');
  }
  const { allowLate, live } = await assertCanExecutePoint(actor, point, task, atDate, { manualOverride: override });

  let qrAssetId: string | null = null;
  let qrScanLogId: string | null = null;
  if (point.requireQr && !override) {
    const code = input?.qrCode?.trim() ?? '';
    if (!code || !isQinGuanQrPayload(code)) {
      await writeAudit({
        actor,
        action: 'scan',
        module: 'patrol',
        description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${task.siteNameSnapshot}」QR 驗證失敗（${point.pointNameSnapshot}）。`,
        targetType: 'patrol_task_point',
        targetId: point.id,
        result: 'failure',
        siteId: task.siteId,
      });
      throw new Error('此巡邏點必須掃描正確的永久 QR');
    }
    const asset = await getQrAssetByCode(code);
    const log = await insertQrScanLog({
      tenantId,
      siteId: task.siteId,
      qrAssetId: asset?.tenantId === tenantId ? asset.id : null,
      scannerUserId: actor.userId,
      scannerNameSnapshot: actor.fullName,
      scannerRoleSnapshot: actor.roleSnapshot,
      scannedCode: code,
      scanResult:
        !asset
          ? QR_SCAN_RESULTS.INVALID
          : asset.tenantId !== tenantId
            ? QR_SCAN_RESULTS.CROSS_TENANT
            : asset.status === 'inactive'
              ? QR_SCAN_RESULTS.INACTIVE
              : asset.targetType === QR_ASSET_TYPES.PATROL_POINT && asset.targetId === point.patrolPointId
                ? QR_SCAN_RESULTS.VALID
                : QR_SCAN_RESULTS.INVALID,
      scannedAt: at,
      latitude: null,
      longitude: null,
      deviceId: actor.deviceId,
      appVersion: actor.appVersion,
    });
    qrScanLogId = log.id;
    if (!asset || asset.tenantId !== tenantId) {
      throw new Error(asset ? '此 QR 不屬於目前公司' : '此 QR 不是勤管系統資產');
    }
    if (asset.status === 'inactive') throw new Error('此 QR 已停用');
    if (asset.targetType !== QR_ASSET_TYPES.PATROL_POINT || asset.targetId !== point.patrolPointId) {
      await writeAudit({
        actor,
        action: 'scan',
        module: 'patrol',
        description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${task.siteNameSnapshot}」掃到與巡邏點不符的 QR。`,
        targetType: 'patrol_task_point',
        targetId: point.id,
        result: 'failure',
        siteId: task.siteId,
      });
      throw new Error('QR 與目前巡邏點不符');
    }
    qrAssetId = asset.id;
    await recordQrAssetScan(asset.id, tenantId, at);
  }

  const fix = await optionalFix(input);
  let distanceMeters: number | null = null;
  if (point.requireGps && !override) {
    if (point.latitudeSnapshot == null || point.longitudeSnapshot == null) {
      await createPatrolException(actor, {
        taskId: task.id,
        taskPointId: point.id,
        category: 'configuration_exception',
        severity: 'important',
        description: '巡邏點尚未設定 GPS 座標，請通知主管',
        at: atDate,
      });
      throw new Error('巡邏點尚未設定 GPS 座標，請通知主管');
    }
    if (fix.latitude == null || fix.longitude == null || !isValidCoordinate(fix.latitude, fix.longitude)) {
      await writeAudit({
        actor,
        action: 'update',
        module: 'patrol',
        description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${task.siteNameSnapshot}」GPS 驗證失敗（無法取得座標）。`,
        targetType: 'patrol_task_point',
        targetId: point.id,
        result: 'failure',
        siteId: task.siteId,
      });
      throw new Error('無法取得目前 GPS，不能完成此巡邏點');
    }
    distanceMeters = Math.round(
      haversineMeters(fix.latitude, fix.longitude, point.latitudeSnapshot, point.longitudeSnapshot),
    );
    const radius = point.gpsRadiusMetersSnapshot ?? 30;
    if (distanceMeters > radius) {
      await writeAudit({
        actor,
        action: 'update',
        module: 'patrol',
        description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${task.siteNameSnapshot}」GPS 驗證失敗（距離 ${distanceMeters} 公尺）。`,
        targetType: 'patrol_task_point',
        targetId: point.id,
        result: 'failure',
        siteId: task.siteId,
      });
      throw new Error(`您距離巡邏點 ${distanceMeters} 公尺，允許範圍 ${radius} 公尺`);
    }
  }

  if (point.requirePhoto && !input?.photoLocalUri) {
    throw new Error('此巡邏點必須拍攝現場照片');
  }

  const result = override
    ? PATROL_CHECK_RESULTS.MANUAL_OVERRIDE
    : live === PATROL_POINT_LIVE_STATUSES.LATE || (allowLate && point.missedAt)
      ? PATROL_CHECK_RESULTS.LATE_SUCCESS
      : PATROL_CHECK_RESULTS.SUCCESS;

  let evidence: PatrolEvidence | null = null;
  if (input?.photoLocalUri) {
    const template = await getPatrolTemplateById(task.patrolTemplateId, tenantId);
    const watermark = await applyPatrolWatermark({
      originalUri: input.photoLocalUri,
      siteName: task.siteNameSnapshot,
      pointName: point.pointNameSnapshot,
      personName: actor.fullName,
      capturedAt: at,
      latitude: fix.latitude,
      longitude: fix.longitude,
      liveCameraOnly: template?.liveCameraOnly ?? true,
    });
    evidence = await insertPatrolEvidence({
      tenantId,
      siteId: task.siteId,
      patrolTaskId: task.id,
      patrolTaskPointId: point.id,
      localUri: watermark.originalUri,
      watermarkUri: watermark.watermarkUri,
      capturedBy: actor.userId,
      capturedAt: at,
      latitude: fix.latitude,
      longitude: fix.longitude,
      deviceId: actor.deviceId,
    });
  }

  let check: PatrolCheckRecord;
  try {
    check = await insertPatrolCheckRecord({
      tenantId,
      siteId: task.siteId,
      patrolTaskId: task.id,
      patrolTaskPointId: point.id,
      userId: actor.userId,
      checkedAt: at,
      qrAssetId,
      qrScanLogId,
      latitude: fix.latitude,
      longitude: fix.longitude,
      distanceMeters,
      gpsAccuracy: fix.accuracy,
      gpsMocked: fix.mocked,
      photoRequired: point.requirePhoto,
      photoCompleted: Boolean(evidence),
      result,
      note: override
        ? `${input?.manualOverride?.reason}：${input?.manualOverride?.description}`
        : input?.note ?? null,
      timeSource: 'device',
      deviceTime: at,
      serverTime: null,
      createdBy: actor.userId,
      deviceId: actor.deviceId,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(text)) {
      throw new Error(`此巡邏點已於 ${point.completedAt ? formatDateTimeZh(point.completedAt).slice(-5) : '稍早'} 完成`);
    }
    throw error;
  }

  await updatePatrolTaskPointState(point.id, tenantId, {
    status: result === PATROL_CHECK_RESULTS.LATE_SUCCESS ? PATROL_POINT_LIVE_STATUSES.LATE : PATROL_POINT_LIVE_STATUSES.COMPLETED,
    completedAt: at,
    missedAt: result === PATROL_CHECK_RESULTS.LATE_SUCCESS ? point.missedAt ?? at : point.missedAt,
  });
  await refreshPatrolTask(tenantId, task.id, atDate);

  const verb =
    result === PATROL_CHECK_RESULTS.MANUAL_OVERRIDE
      ? '補登'
      : result === PATROL_CHECK_RESULTS.LATE_SUCCESS
        ? '逾時補巡'
        : '完成';
  await writeAudit({
    actor,
    action: 'update',
    module: 'patrol',
    description: `${actor.fullName} 於 ${formatDateTimeZh(at)} 在「${task.siteNameSnapshot}」${verb}巡邏點「${point.pointNameSnapshot}」。`,
    targetType: 'patrol_task_point',
    targetId: point.id,
    targetDisplayName: point.pointNameSnapshot,
    after: check,
    siteId: task.siteId,
  });

  return { check, evidence };
}

export async function savePatrolPhoto(
  actor: ActorContext,
  input: { taskPointId: string; localUri: string; latitude?: number | null; longitude?: number | null; at?: Date },
): Promise<PatrolEvidence> {
  const tenantId = requireActorTenant(actor);
  const point = await requirePatrolTaskPoint(input.taskPointId, tenantId);
  const task = await requirePatrolTask(point.patrolTaskId, tenantId);
  const at = (input.at ?? new Date()).toISOString();
  const watermark = await applyPatrolWatermark({
    originalUri: input.localUri,
    siteName: task.siteNameSnapshot,
    pointName: point.pointNameSnapshot,
    personName: actor.fullName,
    capturedAt: at,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    liveCameraOnly: true,
  });
  return insertPatrolEvidence({
    tenantId,
    siteId: task.siteId,
    patrolTaskId: task.id,
    patrolTaskPointId: point.id,
    localUri: watermark.originalUri,
    watermarkUri: watermark.watermarkUri,
    capturedBy: actor.userId,
    capturedAt: at,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    deviceId: actor.deviceId,
  });
}

export { listPatrolEvidenceForPoint };
