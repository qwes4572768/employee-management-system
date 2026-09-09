export const PATROL_POINT_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type PatrolPointStatus = (typeof PATROL_POINT_STATUSES)[keyof typeof PATROL_POINT_STATUSES];

export const PATROL_SCHEDULE_MODES = {
  DAILY: 'daily',
  WEEKDAY: 'weekday',
  CUSTOM: 'custom',
} as const;

export type PatrolScheduleMode = (typeof PATROL_SCHEDULE_MODES)[keyof typeof PATROL_SCHEDULE_MODES];

export const PATROL_TASK_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  MISSED: 'missed',
  CANCELLED: 'cancelled',
} as const;

export type PatrolTaskStatus = (typeof PATROL_TASK_STATUSES)[keyof typeof PATROL_TASK_STATUSES];

export const PATROL_TASK_STATUS_LABELS: Record<PatrolTaskStatus, string> = {
  pending: '待執行',
  active: '執行中',
  completed: '已完成',
  partial: '部分完成',
  missed: '漏巡',
  cancelled: '已取消',
};

export const PATROL_POINT_LIVE_STATUSES = {
  UPCOMING: 'upcoming',
  AVAILABLE: 'available',
  COMPLETED: 'completed',
  LATE: 'late',
  MISSED: 'missed',
  EXCEPTION: 'exception',
} as const;

export type PatrolPointLiveStatus =
  (typeof PATROL_POINT_LIVE_STATUSES)[keyof typeof PATROL_POINT_LIVE_STATUSES];

export const PATROL_POINT_LIVE_LABELS: Record<PatrolPointLiveStatus, string> = {
  upcoming: '尚未開放',
  available: '可巡',
  completed: '已完成',
  late: '逾時但仍可補巡',
  missed: '漏巡',
  exception: '異常',
};

export const PATROL_POINT_LIVE_MARKS: Record<PatrolPointLiveStatus, string> = {
  upcoming: '⚪',
  available: '🔵',
  completed: '✅',
  late: '🟠',
  missed: '🔴',
  exception: '⚠',
};

export const PATROL_CHECK_RESULTS = {
  SUCCESS: 'success',
  LATE_SUCCESS: 'late_success',
  EXCEPTION: 'exception',
  MANUAL_OVERRIDE: 'manual_override',
} as const;

export type PatrolCheckResult = (typeof PATROL_CHECK_RESULTS)[keyof typeof PATROL_CHECK_RESULTS];

export const PATROL_EXCEPTION_CATEGORIES = [
  { value: 'door_lock', label: '門鎖異常' },
  { value: 'equipment', label: '設備損壞' },
  { value: 'water_leak', label: '漏水' },
  { value: 'fire', label: '消防異常' },
  { value: 'suspicious_person', label: '可疑人員' },
  { value: 'environment', label: '環境異常' },
  { value: 'configuration_exception', label: '設定異常' },
  { value: 'other', label: '其他' },
] as const;

export type PatrolExceptionCategory = (typeof PATROL_EXCEPTION_CATEGORIES)[number]['value'];

export const PATROL_EXCEPTION_SEVERITIES = {
  GENERAL: 'general',
  IMPORTANT: 'important',
  URGENT: 'urgent',
  MAJOR: 'major',
} as const;

export type PatrolExceptionSeverity =
  (typeof PATROL_EXCEPTION_SEVERITIES)[keyof typeof PATROL_EXCEPTION_SEVERITIES];

export const PATROL_EXCEPTION_SEVERITY_LABELS: Record<PatrolExceptionSeverity, string> = {
  general: '一般',
  important: '重要',
  urgent: '緊急',
  major: '重大',
};

export const PATROL_EXCEPTION_STATUSES = {
  OPEN: 'open',
  PROCESSING: 'processing',
  RESOLVED: 'resolved',
} as const;

export type PatrolExceptionStatus =
  (typeof PATROL_EXCEPTION_STATUSES)[keyof typeof PATROL_EXCEPTION_STATUSES];

export const PATROL_OVERRIDE_REASONS = [
  { value: 'phone_failure', label: '手機故障' },
  { value: 'qr_damaged', label: 'QR 損壞' },
  { value: 'gps_failure', label: 'GPS 故障' },
  { value: 'other', label: '其他' },
] as const;

export const PATROL_TIME_SOURCES = {
  DEVICE: 'device',
  SERVER: 'server',
} as const;

export type PatrolTimeSource = (typeof PATROL_TIME_SOURCES)[keyof typeof PATROL_TIME_SOURCES];
