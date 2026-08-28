export const STAFFING_MODES = {
  FIXED: 'fixed',
  MOBILE: 'mobile',
  TRAINEE: 'trainee',
} as const;

export type StaffingMode = (typeof STAFFING_MODES)[keyof typeof STAFFING_MODES];

export const STAFFING_MODE_LABELS: Record<StaffingMode, string> = {
  fixed: '固定勤務人員',
  mobile: '機動勤務人員',
  trainee: '見習人員',
};

export function isStaffingMode(value: string | null | undefined): value is StaffingMode {
  return value === STAFFING_MODES.FIXED || value === STAFFING_MODES.MOBILE || value === STAFFING_MODES.TRAINEE;
}

export function staffingModeLabel(mode: string | null | undefined): string {
  if (isStaffingMode(mode)) {
    return STAFFING_MODE_LABELS[mode];
  }
  return '未設定勤務型態';
}

export const STAFFING_COVERAGE_STATUSES = {
  OK: 'ok',
  SHORT: 'short',
  OVER: 'over',
  UNKNOWN: 'unknown',
} as const;

export const UNSET_MINIMUM_HEADCOUNT_LABEL = '尚未設定最低勤務人數';
export const UNSET_STAFFING_REQUIREMENT_LABEL = '尚未設定人力需求';
