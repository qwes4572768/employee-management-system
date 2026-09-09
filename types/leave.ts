import type { BereavementRelation, LeaveStatus, LeaveType } from '@/constants/leave';
import type { SyncMeta } from './models';

export interface LeavePolicy extends SyncMeta {
  id: string;
  tenantId: string;
  jurisdictionCode: string;
  annualLeaveRecommendedAdvanceDays: number;
  personalLeaveRecommendedAdvanceDays: number;
  sickLeaveDocumentDueHours: number;
  preferredDayOffMonthlyLimit: number;
  personalLeaveMonthlyInterviewThreshold: number;
  personalLeaveAnnualMaxDays: number;
}

export interface LeaveBalance extends SyncMeta {
  id: string;
  tenantId: string;
  userId: string;
  leaveType: string;
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  periodStart: string;
  periodEnd: string;
  carryoverDays: number;
}

export interface LeaveRequest extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string | null;
  userId: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  isUrgent: boolean;
  urgentReason: string | null;
  hospitalized: boolean;
  bereavementRelation: BereavementRelation | null;
  officialBasis: string | null;
  documentStatus: string;
  documentDueAt: string | null;
  managerInterviewRequired: boolean;
}

export interface LeaveRequestAttachment extends SyncMeta {
  id: string;
  tenantId: string;
  leaveRequestId: string;
  fileName: string;
  mimeType: string;
  localUri: string;
  kind: string;
}

export interface LeaveReviewHistory {
  id: string;
  tenantId: string;
  leaveRequestId: string;
  action: string;
  actorUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface LeaveInterview extends SyncMeta {
  id: string;
  tenantId: string;
  leaveRequestId: string;
  interviewerUserId: string;
  interviewedAt: string;
  content: string;
  result: string;
}

export interface PreferredDayOff extends SyncMeta {
  id: string;
  tenantId: string;
  userId: string;
  leaveRequestId: string;
  offDate: string;
  yearMonth: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ScheduleLeaveLink {
  id: string;
  tenantId: string;
  scheduleId: string;
  leaveRequestId: string;
  createdAt: string;
}
