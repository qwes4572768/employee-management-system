import type {
  DisciplineActionKey,
  DisciplineDecision,
  ImprovementStatus,
  InspectionCheckLevel,
  InspectionCriteriaKey,
  InspectionGrade,
  InspectionSessionStatus,
  InspectionVerificationStatus,
} from '@/constants/inspection';
import type { SyncMeta } from './models';
import type { PatrolTaskStats } from './patrol';

export interface InspectionPolicy extends SyncMeta {
  id: string;
  tenantId: string;
  excellentMinScore: number;
  goodMinScore: number;
  passMinScore: number;
}

export interface InspectionCriteria extends SyncMeta {
  id: string;
  tenantId: string;
  criteriaKey: InspectionCriteriaKey;
  displayName: string;
  maxScore: number;
  weight: number;
  required: boolean;
  majorEligible: boolean;
  status: 'active' | 'inactive';
  sortOrder: number;
}

export interface InspectionSession extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  employeeUserId: string;
  inspectorUserId: string;
  employeeQrAssetId: string | null;
  qrScanLogId: string | null;
  startedAt: string;
  completedAt: string | null;
  inspectorLatitude: number | null;
  inspectorLongitude: number | null;
  inspectorDistanceMeters: number | null;
  remoteInspectionWarning: boolean;
  verificationStatus: InspectionVerificationStatus;
  scheduleId: string | null;
  attendanceId: string | null;
  workSessionId: string | null;
  employeeNameSnapshot: string;
  employeeNoSnapshot: string | null;
  jobTitleSnapshot: string | null;
  siteNameSnapshot: string;
  inspectorNameSnapshot: string;
  previousInspectionId: string | null;
  reinspectionRequired: boolean;
  reinspectionDueAt: string | null;
  status: InspectionSessionStatus;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  timeSource: 'device' | 'server';
  deviceTime: string;
  serverTime: string | null;
}

export interface InspectionCheckItem {
  key: string;
  label: string;
  level: InspectionCheckLevel;
  detail: string;
}

export interface InspectionVerification {
  status: InspectionVerificationStatus;
  checks: InspectionCheckItem[];
  remoteInspectionWarning: boolean;
  inspectorDistanceMeters: number | null;
}

export interface InspectionEmployeeCard {
  userId: string;
  photoUri: string | null;
  fullName: string;
  employeeNo: string | null;
  gender: string;
  hireDate: string | null;
  jobTitle: string | null;
  staffingMode: string;
  staffingModeLabel: string;
  currentSiteName: string | null;
  todayShiftName: string | null;
  scheduledStartAt: string | null;
  clockInAt: string | null;
  onDuty: boolean;
  patrol: PatrolTaskStats | null;
}

export interface InspectionEvaluation extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  inspectionSessionId: string;
  employeeUserId: string;
  inspectorUserId: string;
  totalScore: number;
  maxScore: number;
  weightedScore: number;
  grade: InspectionGrade;
  summary: string | null;
  majorDeficiency: boolean;
  revisesEvaluationId: string | null;
  status: 'draft' | 'completed' | 'voided';
}

export interface InspectionEvaluationItem extends SyncMeta {
  id: string;
  tenantId: string;
  evaluationId: string;
  criteriaId: string;
  criteriaKeySnapshot: string;
  criteriaNameSnapshot: string;
  score: number;
  maxScore: number;
  weight: number;
  comment: string | null;
  isAbnormal: boolean;
  sourcePatrolExceptionId: string | null;
  sourcePatrolTaskPointId: string | null;
}

export interface InspectionEvidence extends SyncMeta {
  id: string;
  tenantId: string;
  inspectionSessionId: string;
  evaluationId: string | null;
  kind: string;
  localUri: string;
  watermarkUri: string | null;
  capturedBy: string | null;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
}

export interface ImprovementOrder extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  employeeUserId: string;
  inspectionEvaluationId: string;
  title: string;
  description: string;
  severity: 'general' | 'important' | 'urgent';
  dueAt: string | null;
  status: ImprovementStatus;
  assignedTo: string | null;
}

export interface ImprovementFollowup extends SyncMeta {
  id: string;
  tenantId: string;
  improvementOrderId: string;
  actorUserId: string | null;
  actorNameSnapshot: string;
  action: string;
  note: string | null;
  photoUri: string | null;
}

export interface DisciplinaryRecommendation extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  inspectionEvaluationId: string | null;
  employeeUserId: string;
  recommendedBy: string;
  actionKey: DisciplineActionKey;
  actionLabelSnapshot: string;
  reason: string;
  compensationClaimAmount: number | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'returned' | 'modified';
}

export interface DisciplinaryReview extends SyncMeta {
  id: string;
  tenantId: string;
  recommendationId: string;
  reviewerUserId: string;
  decision: DisciplineDecision;
  finalAction: string | null;
  reviewNote: string | null;
  reviewedAt: string;
}

export interface InspectionHomeCard {
  latest: InspectionEvaluation | null;
  latestScore: number | null;
  latestGrade: InspectionGrade | null;
  openImprovements: number;
}

export interface InspectionSiteDashboard {
  siteId: string;
  siteName: string;
  todayCount: number;
  averageScore: number | null;
  failCount: number;
  majorCount: number;
  openImprovements: number;
  overdueImprovements: number;
  pendingDiscipline: number;
}
