export const APP_NAME = '勤管系統';
export const APP_NAME_EN = 'QinGuan System';
export const APP_VERSION = '1.0.0';
export const DATABASE_NAME = 'qinguan.db';

export const SESSION_STORE_KEY = 'qinguan.session';
export const DEVICE_ID_KEY = 'qinguan.deviceId';
export const THEME_PREFS_KEY = 'qinguan.themePrefs';
export const CURRENT_SITE_KEY = 'currentSiteId';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ROLE_KEYS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
} as const;

export const DEFAULT_ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: '企業總管理員',
  MANAGER: '主管',
  STAFF: '一般勤務人員',
};

export const GENDER_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  unspecified: '不便透露',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  pending: '待審核',
  returned: '退回補資料',
  rejected: '已拒絕',
  active: '已開通',
  suspended: '已停權',
};

export const SITE_STATUS_LABELS: Record<string, string> = {
  active: '啟用中',
  inactive: '已停用',
  archived: '已封存',
};

export const INDUSTRY_OPTIONS = [
  { value: 'security', label: '保全服務' },
  { value: 'property', label: '物業管理' },
  { value: 'mixed', label: '綜合服務' },
  { value: 'other', label: '其他' },
] as const;

export const MODULE_LABELS: Record<string, string> = {
  users: '帳號',
  sites: '案場',
  roles: '角色',
  permissions: '權限',
  tenants: '公司',
  audit: '操作日誌',
  accounts: '帳號審核',
  auth: '登入',
  profile: '個人資料',
  schedule: '排班',
  attendance: '出勤',
  workSession: '勤務',
  leave: '假勤',
};

export const ACTION_LABELS: Record<string, string> = {
  view: '檢視',
  create: '新增',
  update: '修改',
  delete: '刪除',
  export: '匯出',
  approve: '核准',
  viewSensitive: '檢視敏感資料',
  viewHistory: '檢視歷史',
  viewAuditLog: '檢視稽核',
  assign: '授權',
};
