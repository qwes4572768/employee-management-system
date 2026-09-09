export const zhTW = {
  appName: '勤管系統',
  welcomeTitle: '歡迎使用勤管系統',
  welcomeSubtitle: '保全與物業勤務管理 · 本機優先 · 企業級稽核',
  createSystem: '建立新系統',
  joinCompany: '加入既有公司',
  joinCompanyDisabled: '雲端企業加入功能將於伺服器版本開放',
  initializing: '系統初始化',
  createAdmin: '建立第一位總管理員',
  createCompany: '建立公司資料',
  createFirstSite: '建立第一個案場',
  skipSite: '稍後再建立案場',
  login: '登入',
  register: '註冊帳號',
  logout: '登出',
  home: '首頁',
  manage: '管理',
  me: '我的',
  emptySites: '尚未建立案場',
  emptySitesHint: '建立第一個案場後即可開始設定勤務',
  emptyApprovals: '目前沒有待審核帳號',
  emptyAudit: '目前尚無操作紀錄',
  emptyOnDuty: '目前尚無當班資料',
  emptyOnDutyHint: '排班功能啟用後，將顯示當班勤務人員',
  noData: '尚無資料',
  featureDisabled: '功能尚未啟用',
  pendingAccount: '帳號正在等待主管開通',
  currentSite: '目前案場',
  noAuthorizedSite: '尚未授權案場',
} as const;

export type MessageKey = keyof typeof zhTW;

export function t(key: MessageKey): string {
  return zhTW[key];
}
