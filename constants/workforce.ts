export const SCHEDULE_TYPES = {
  NORMAL: 'normal',
  TEMPORARY: 'temporary',
  SUPPORT: 'support',
  REPLACEMENT: 'replacement',
  TRAINING: 'training',
} as const;

export type ScheduleType = (typeof SCHEDULE_TYPES)[keyof typeof SCHEDULE_TYPES];

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  normal: '一般排班',
  temporary: '臨時勤務',
  support: '機動支援',
  replacement: '代班',
  training: '見習勤務',
};

export const SCHEDULE_STATUSES = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[keyof typeof SCHEDULE_STATUSES];

export const WARNING_TYPES = {
  SCHEDULE_OVERLAP: 'schedule_overlap',
  INSUFFICIENT_REST: 'insufficient_rest',
  TRAINING_OVERLAP: 'training_overlap',
  WEEKLY_REST: 'weekly_rest',
  EXCESSIVE_DAILY_HOURS: 'excessive_daily_hours',
  EXCESSIVE_WEEKLY_HOURS: 'excessive_weekly_hours',
  EXCESSIVE_MONTHLY_HOURS: 'excessive_monthly_hours',
  CONSECUTIVE_WORK_DAYS: 'consecutive_work_days',
} as const;

export type WarningType = (typeof WARNING_TYPES)[keyof typeof WARNING_TYPES];

export const DEFAULT_MINIMUM_REST_MINUTES = 480;
export const DEFAULT_LATE_GRACE_MINUTES = 5;
export const DEFAULT_EARLY_LEAVE_GRACE_MINUTES = 5;

export const CLOCK_METHODS = {
  MANUAL: 'manual',
  GPS: 'gps',
  QR: 'qr',
  GPS_QR: 'gps_qr',
} as const;

export const ATTENDANCE_STATUSES = {
  NORMAL: 'normal',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  MISSING_CLOCK_IN: 'missing_clock_in',
  MISSING_CLOCK_OUT: 'missing_clock_out',
  EXCEPTION: 'exception',
} as const;

export const WORK_SESSION_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FORCED_CLOSED: 'forced_closed',
  CANCELLED: 'cancelled',
} as const;

export const WEEKLY_REST_MODES = {
  STANDARD_TW: 'standard_tw',
  TWO_WEEK: 'two_week',
  EIGHT_WEEK: 'eight_week',
  FOUR_WEEK: 'four_week',
} as const;
