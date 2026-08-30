export const LEAVE_TYPES = {
  PREFERRED_DAY_OFF: 'preferred_day_off',
  ANNUAL_LEAVE: 'annual_leave',
  SICK_LEAVE: 'sick_leave',
  BEREAVEMENT_LEAVE: 'bereavement_leave',
  PERSONAL_LEAVE: 'personal_leave',
  OFFICIAL_LEAVE: 'official_leave',
} as const;

export type LeaveType = (typeof LEAVE_TYPES)[keyof typeof LEAVE_TYPES];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  preferred_day_off: '例假 / 排休希望日',
  annual_leave: '特別休假',
  sick_leave: '普通傷病假',
  bereavement_leave: '喪假',
  personal_leave: '事假',
  official_leave: '公假',
};

export const LEAVE_STATUSES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
  DOCUMENT_PENDING: 'document_pending',
  DOCUMENT_OVERDUE: 'document_overdue',
  INTERVIEW_REQUIRED: 'interview_required',
  CANCELLED: 'cancelled',
} as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[keyof typeof LEAVE_STATUSES];

export const DOCUMENT_STATUSES = {
  NOT_REQUIRED_YET: 'not_required_yet',
  PENDING_DOCUMENT: 'pending_document',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  OVERDUE: 'overdue',
} as const;

export const BEREAVEMENT_RELATIONS = {
  PARENT: 'parent',
  ADOPTIVE_PARENT: 'adoptive_parent',
  STEP_PARENT: 'step_parent',
  SPOUSE: 'spouse',
  GRANDPARENT: 'grandparent',
  CHILD: 'child',
  SPOUSE_PARENT: 'spouse_parent',
  SPOUSE_ADOPTIVE_PARENT: 'spouse_adoptive_parent',
  SPOUSE_STEP_PARENT: 'spouse_step_parent',
  GREAT_GRANDPARENT: 'great_grandparent',
  SIBLING: 'sibling',
  SPOUSE_GRANDPARENT: 'spouse_grandparent',
} as const;

export type BereavementRelation = (typeof BEREAVEMENT_RELATIONS)[keyof typeof BEREAVEMENT_RELATIONS];

export const BEREAVEMENT_RELATION_LABELS: Record<BereavementRelation, string> = {
  parent: '父母',
  adoptive_parent: '養父母',
  step_parent: '繼父母',
  spouse: '配偶',
  grandparent: '祖父母',
  child: '子女',
  spouse_parent: '配偶之父母',
  spouse_adoptive_parent: '配偶之養父母',
  spouse_step_parent: '配偶之繼父母',
  great_grandparent: '曾祖父母',
  sibling: '兄弟姊妹',
  spouse_grandparent: '配偶之祖父母',
};

export const DEFAULT_LEAVE_POLICY = {
  jurisdictionCode: 'TW',
  annualLeaveRecommendedAdvanceDays: 30,
  personalLeaveRecommendedAdvanceDays: 30,
  sickLeaveDocumentDueHours: 72,
  preferredDayOffMonthlyLimit: 2,
  personalLeaveMonthlyInterviewThreshold: 3,
  personalLeaveAnnualCapDays: 14,
};

export const ACTIVE_LEAVE_STATUSES: LeaveStatus[] = [
  LEAVE_STATUSES.SUBMITTED,
  LEAVE_STATUSES.PENDING,
  LEAVE_STATUSES.APPROVED,
  LEAVE_STATUSES.DOCUMENT_PENDING,
  LEAVE_STATUSES.DOCUMENT_OVERDUE,
  LEAVE_STATUSES.INTERVIEW_REQUIRED,
];
