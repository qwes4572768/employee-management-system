export const INSPECTION_CRITERIA_KEYS = [
  'appearance',
  'attention',
  'sleeping',
  'leaving_post',
  'phone_use',
  'courtesy',
  'duty_log',
  'patrol',
  'cleanliness',
  'equipment',
  'handover',
  'other',
] as const;

export type InspectionCriteriaKey = (typeof INSPECTION_CRITERIA_KEYS)[number];

export const INSPECTION_CRITERIA_LABELS: Record<InspectionCriteriaKey, string> = {
  appearance: '服裝儀容',
  attention: '勤務專注',
  sleeping: '睡覺',
  leaving_post: '擅離職守',
  phone_use: '使用手機',
  courtesy: '服務禮貌',
  duty_log: '勤務紀錄',
  patrol: '巡邏執行',
  cleanliness: '環境整潔',
  equipment: '裝備狀況',
  handover: '交接狀況',
  other: '其他',
};

export const DEFAULT_MAJOR_CRITERIA: InspectionCriteriaKey[] = ['sleeping', 'leaving_post'];

export const INSPECTION_SESSION_STATUSES = {
  DRAFT: 'draft',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  VOIDED: 'voided',
} as const;

export type InspectionSessionStatus =
  (typeof INSPECTION_SESSION_STATUSES)[keyof typeof INSPECTION_SESSION_STATUSES];

export const INSPECTION_VERIFICATION_STATUSES = {
  NORMAL: 'normal',
  WARNING: 'warning',
  EXCEPTION: 'exception',
} as const;

export type InspectionVerificationStatus =
  (typeof INSPECTION_VERIFICATION_STATUSES)[keyof typeof INSPECTION_VERIFICATION_STATUSES];

export const INSPECTION_CHECK_LEVELS = {
  NORMAL: 'normal',
  WARNING: 'warning',
  EXCEPTION: 'exception',
} as const;

export type InspectionCheckLevel = (typeof INSPECTION_CHECK_LEVELS)[keyof typeof INSPECTION_CHECK_LEVELS];

export const INSPECTION_GRADES = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  PASS: 'pass',
  NEEDS_IMPROVEMENT: 'needs_improvement',
  SERIOUS_ISSUE: 'serious_issue',
} as const;

export type InspectionGrade = (typeof INSPECTION_GRADES)[keyof typeof INSPECTION_GRADES];

export const INSPECTION_GRADE_LABELS: Record<InspectionGrade, string> = {
  excellent: '優良',
  good: '良好',
  pass: '合格',
  needs_improvement: '待改善',
  serious_issue: '重大缺失',
};

export const IMPROVEMENT_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  CLOSED: 'closed',
} as const;

export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[keyof typeof IMPROVEMENT_STATUSES];

export const DISCIPLINE_ACTION_KEYS = [
  'verbal_warning',
  'written_warning',
  'demerit',
  'retraining',
  'remove_from_site',
  'suspension_recommendation',
  'compensation_review',
  'other',
] as const;

export type DisciplineActionKey = (typeof DISCIPLINE_ACTION_KEYS)[number];

export const DISCIPLINE_ACTION_LABELS: Record<DisciplineActionKey, string> = {
  verbal_warning: '口頭警告',
  written_warning: '書面警告',
  demerit: '記過建議',
  retraining: '再訓練',
  remove_from_site: '調離案場建議',
  suspension_recommendation: '停班建議',
  compensation_review: '賠償審核',
  other: '其他',
};

export const DISCIPLINE_DECISIONS = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  MODIFIED: 'modified',
} as const;

export type DisciplineDecision = (typeof DISCIPLINE_DECISIONS)[keyof typeof DISCIPLINE_DECISIONS];

export const DEFAULT_INSPECTION_POLICY = {
  excellentMinScore: 90,
  goodMinScore: 80,
  passMinScore: 70,
};

export const STAFFING_MODE_LABELS: Record<string, string> = {
  fixed: '固定案場',
  mobile: '機動支援',
  trainee: '見習',
};
