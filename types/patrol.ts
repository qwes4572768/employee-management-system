import type {
  PatrolCheckResult,
  PatrolExceptionCategory,
  PatrolExceptionSeverity,
  PatrolExceptionStatus,
  PatrolPointLiveStatus,
  PatrolPointStatus,
  PatrolScheduleMode,
  PatrolTaskStatus,
  PatrolTimeSource,
} from '@/constants/patrol';
import type { SyncMeta } from './models';

export interface PatrolPoint extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  code: string;
  description: string | null;
  locationNote: string | null;
  latitude: number | null;
  longitude: number | null;
  gpsRadiusMeters: number | null;
  requireQr: boolean;
  requireGps: boolean;
  requirePhoto: boolean;
  status: PatrolPointStatus;
  sortOrder: number;
}

export interface PatrolTemplate extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  description: string | null;
  shiftTemplateId: string | null;
  scheduleMode: PatrolScheduleMode;
  scheduleWeekdays: number[] | null;
  customDates: string[] | null;
  status: 'active' | 'inactive';
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  allowLatePatrol: boolean;
  enforceSequence: boolean;
  liveCameraOnly: boolean;
}

export interface PatrolTemplatePoint extends SyncMeta {
  id: string;
  tenantId: string;
  patrolTemplateId: string;
  patrolPointId: string;
  sequenceNo: number;
  windowStartTime: string;
  windowEndTime: string;
  requiredCount: number;
  requireQrOverride: boolean | null;
  requireGpsOverride: boolean | null;
  requirePhotoOverride: boolean | null;
  graceMinutes: number;
  isRequired: boolean;
  isCritical: boolean;
}

export interface PatrolTask extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  userId: string;
  scheduleId: string | null;
  workSessionId: string | null;
  patrolTemplateId: string;
  taskDate: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: PatrolTaskStatus;
  totalPoints: number;
  completedPoints: number;
  missedPoints: number;
  completionRate: number;
  templateNameSnapshot: string;
  siteNameSnapshot: string;
}

export interface PatrolTaskPoint extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolPointId: string;
  pointNameSnapshot: string;
  pointCodeSnapshot: string;
  sequenceNo: number;
  windowStartAt: string;
  windowEndAt: string;
  requireQr: boolean;
  requireGps: boolean;
  requirePhoto: boolean;
  gpsRadiusMetersSnapshot: number | null;
  latitudeSnapshot: number | null;
  longitudeSnapshot: number | null;
  graceMinutes: number;
  isRequired: boolean;
  isCritical: boolean;
  status: PatrolPointLiveStatus;
  completedAt: string | null;
  missedAt: string | null;
}

export interface PatrolCheckRecord {
  id: string;
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolTaskPointId: string;
  userId: string;
  checkedAt: string;
  qrAssetId: string | null;
  qrScanLogId: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  gpsAccuracy: number | null;
  gpsMocked: boolean | null;
  photoRequired: boolean;
  photoCompleted: boolean;
  result: PatrolCheckResult;
  note: string | null;
  timeSource: PatrolTimeSource;
  deviceTime: string;
  serverTime: string | null;
  createdBy: string | null;
  createdAt: string;
  version: number;
  syncStatus: string;
  deviceId: string | null;
}

export interface PatrolEvidence {
  id: string;
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolTaskPointId: string | null;
  localUri: string;
  watermarkUri: string | null;
  capturedBy: string | null;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  deviceId: string | null;
  createdAt: string;
  syncStatus: string;
}

export interface PatrolException extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  patrolTaskId: string;
  patrolTaskPointId: string | null;
  reportedBy: string;
  category: PatrolExceptionCategory;
  severity: PatrolExceptionSeverity;
  description: string;
  status: PatrolExceptionStatus;
  reportedAt: string;
  resolvedAt: string | null;
  sourceModule: string;
}

export interface PatrolPointView extends PatrolTaskPoint {
  liveStatus: PatrolPointLiveStatus;
  windowLabel: string;
  completedAtLabel: string | null;
}

export interface PatrolTaskStats {
  totalRequired: number;
  completed: number;
  onTime: number;
  late: number;
  missed: number;
  exceptions: number;
  completionRate: number;
  criticalMissed: number;
}

export interface PatrolHomeCard {
  task: PatrolTask | null;
  stats: PatrolTaskStats;
  nextPoint: PatrolPointView | null;
  minutesUntilNext: number | null;
  criticalWarning: string | null;
}

export interface PatrolSiteDashboard {
  siteId: string;
  siteName: string;
  taskCount: number;
  activeCount: number;
  completedCount: number;
  partialCount: number;
  missedTaskCount: number;
  totalPoints: number;
  onTime: number;
  late: number;
  missed: number;
  exceptions: number;
  completionRate: number;
  criticalMissed: number;
  criticalWarning: string | null;
}
