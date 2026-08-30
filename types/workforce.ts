import type { StaffingMode } from '@/constants/staffing';
import type { ScheduleStatus, ScheduleType, WarningType } from '@/constants/workforce';
import type { SyncMeta } from './models';

export interface WorkforceSettings extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string | null;
  minimumRestMinutes: number;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  weeklyRestMode: string;
  jurisdictionCode: string;
}

export interface ShiftTemplate extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string | null;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  plannedMinutes: number;
  status: 'active' | 'inactive';
  startsAt: string | null;
  expiresAt: string | null;
}

export interface WorkSchedule extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  userId: string;
  shiftTemplateId: string | null;
  workDate: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  scheduleType: ScheduleType;
  staffingModeSnapshot: StaffingMode;
  allowTrainingOverlap: boolean;
  trainerUserId: string | null;
  trainingReason: string | null;
  status: ScheduleStatus;
  leaveStatus: 'none' | 'leave_approved';
  weeklyRestWarning: boolean;
  note: string | null;
  overrideReason: string | null;
}

export interface OverlapDetail {
  existingId: string;
  existingSiteId: string;
  existingSiteName: string;
  existingStartAt: string;
  existingEndAt: string;
  newSiteId: string;
  newSiteName: string;
  newStartAt: string;
  newEndAt: string;
  overlapStartAt: string;
  overlapEndAt: string;
  overlapMinutes: number;
}

export interface RestDetail {
  previousEndAt: string | null;
  nextStartAt: string | null;
  actualRestMinutes: number;
  minimumRestMinutes: number;
}

export interface WorkforceWarning {
  type: WarningType;
  severity: 'block' | 'warning';
  title: string;
  message: string;
  overlap?: OverlapDetail;
  rest?: RestDetail;
}

export interface AttendanceRecord extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  userId: string;
  scheduleId: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
  clockInDistanceMeters: number | null;
  clockOutDistanceMeters: number | null;
  clockInMethod: string | null;
  clockOutMethod: string | null;
  status: string;
  clockInNote: string | null;
  clockOutNote: string | null;
}

export interface AttendanceCorrectionRequest extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  userId: string;
  attendanceId: string | null;
  scheduleId: string | null;
  requestType: 'missing_in' | 'missing_out' | 'incorrect_time';
  requestedClockInAt: string | null;
  requestedClockOutAt: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  originalClockInAt: string | null;
  originalClockOutAt: string | null;
}

export interface WorkSession extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  userId: string;
  scheduleId: string | null;
  attendanceId: string | null;
  startedAt: string;
  endedAt: string | null;
  startMethod: string;
  endMethod: string | null;
  status: 'active' | 'completed' | 'forced_closed' | 'cancelled';
  unscheduled: boolean;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  note: string | null;
}

export interface AppNotification {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  relatedId: string | null;
  readAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export type SiteShiftRequirementStatus = 'active' | 'inactive';

export interface SiteShiftRequirement extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  shiftTemplateId: string | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  requiredHeadcount: number;
  staffingMode: StaffingMode | null;
  weekday: number | null;
  status: SiteShiftRequirementStatus;
}

export type StaffingCoverageStatus = 'ok' | 'short' | 'over' | 'unknown';

export interface ShiftCoverage {
  siteId: string;
  siteName: string;
  shiftTemplateId: string | null;
  shiftName: string;
  workDate: string;
  requirement: SiteShiftRequirement | null;
  requiredHeadcount: number | null;
  scheduledHeadcount: number;
  scheduledAvailableHeadcount: number;
  approvedLeaveCount: number;
  remainingHeadcount: number;
  shortage: number;
  surplus: number;
  status: StaffingCoverageStatus;
}
