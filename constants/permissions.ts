export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'export',
  'approve',
  'viewSensitive',
  'viewHistory',
  'viewAuditLog',
] as const;

export const PERMISSION_MODULES = [
  { key: 'users', name: '帳號管理' },
  { key: 'sites', name: '案場管理' },
  { key: 'roles', name: '角色管理' },
  { key: 'permissions', name: '權限管理' },
  { key: 'tenants', name: '公司資料' },
  { key: 'audit', name: '操作日誌' },
  { key: 'accounts', name: '帳號審核' },
] as const;

export const EXTRA_PERMISSIONS = [
  {
    permKey: 'sites.assign',
    module: 'sites',
    action: 'assign',
    name: '授權案場',
    description: '將人員授權至案場或移除案場權限',
  },
  {
    permKey: 'users.assignRole',
    module: 'users',
    action: 'assign',
    name: '指派角色',
    description: '為人員指派或調整角色授權',
  },
  {
    permKey: 'schedule.viewOwn',
    module: 'schedule',
    action: 'viewOwn',
    name: '查看自己的班表',
    description: '檢視本人排班',
  },
  {
    permKey: 'schedule.view',
    module: 'schedule',
    action: 'view',
    name: '查看排班',
    description: '檢視公司或案場班表',
  },
  {
    permKey: 'schedule.create',
    module: 'schedule',
    action: 'create',
    name: '建立排班',
    description: '建立班別與排班',
  },
  {
    permKey: 'schedule.update',
    module: 'schedule',
    action: 'update',
    name: '修改排班',
    description: '修改班別與排班',
  },
  {
    permKey: 'schedule.cancel',
    module: 'schedule',
    action: 'cancel',
    name: '取消排班',
    description: '取消已建立的排班',
  },
  {
    permKey: 'attendance.clock',
    module: 'attendance',
    action: 'clock',
    name: '出勤打卡',
    description: '上下班打卡',
  },
  {
    permKey: 'attendance.viewOwn',
    module: 'attendance',
    action: 'viewOwn',
    name: '查看自己的出勤',
    description: '檢視本人出勤紀錄',
  },
  {
    permKey: 'attendance.view',
    module: 'attendance',
    action: 'view',
    name: '查出勤',
    description: '檢視案場或公司出勤',
  },
  {
    permKey: 'attendance.correct.request',
    module: 'attendance',
    action: 'correct.request',
    name: '申請補卡',
    description: '提出出勤更正申請',
  },
  {
    permKey: 'attendance.correct.approve',
    module: 'attendance',
    action: 'correct.approve',
    name: '核准補卡',
    description: '審核出勤更正申請',
  },
  {
    permKey: 'workSession.start',
    module: 'workSession',
    action: 'start',
    name: '開始勤務',
    description: '開始勤務工作階段',
  },
  {
    permKey: 'workSession.end',
    module: 'workSession',
    action: 'end',
    name: '結束勤務',
    description: '結束勤務工作階段',
  },
  {
    permKey: 'workSession.startUnscheduled',
    module: 'workSession',
    action: 'startUnscheduled',
    name: '開始臨時勤務',
    description: '未依排班開始臨時勤務',
  },
  {
    permKey: 'workSession.forceEnd',
    module: 'workSession',
    action: 'forceEnd',
    name: '強制結束勤務',
    description: '強制結束他人勤務',
  },
  {
    permKey: 'workSession.view',
    module: 'workSession',
    action: 'view',
    name: '查看勤務階段',
    description: '檢視勤務工作階段',
  },
  {
    permKey: 'leave.viewOwn',
    module: 'leave',
    action: 'viewOwn',
    name: '查看自己的假勤',
    description: '檢視本人請假與餘額',
  },
  {
    permKey: 'leave.request',
    module: 'leave',
    action: 'request',
    name: '申請假勤',
    description: '提出請假或指定休',
  },
  {
    permKey: 'leave.view',
    module: 'leave',
    action: 'view',
    name: '查看假勤',
    description: '檢視公司請假申請',
  },
  {
    permKey: 'leave.approve',
    module: 'leave',
    action: 'approve',
    name: '核准假勤',
    description: '核准請假申請',
  },
  {
    permKey: 'leave.reject',
    module: 'leave',
    action: 'reject',
    name: '拒絕假勤',
    description: '拒絕請假申請',
  },
  {
    permKey: 'leave.return',
    module: 'leave',
    action: 'return',
    name: '退回假勤',
    description: '退回請假補件',
  },
  {
    permKey: 'leave.attachment.upload',
    module: 'leave',
    action: 'attachment.upload',
    name: '上傳假勤附件',
    description: '上傳診斷證明、訃文或公文',
  },
  {
    permKey: 'leave.attachment.view',
    module: 'leave',
    action: 'attachment.view',
    name: '查看假勤附件',
    description: '檢視敏感假勤附件',
  },
  {
    permKey: 'leave.balance.viewOwn',
    module: 'leave',
    action: 'balance.viewOwn',
    name: '查看自己的假期餘額',
    description: '檢視本人特休與事假餘額',
  },
  {
    permKey: 'leave.balance.view',
    module: 'leave',
    action: 'balance.view',
    name: '查看假期餘額',
    description: '檢視員工假期餘額',
  },
  {
    permKey: 'leave.policy.view',
    module: 'leave',
    action: 'policy.view',
    name: '查看假勤政策',
    description: '檢視假勤政策設定',
  },
  {
    permKey: 'leave.policy.manage',
    module: 'leave',
    action: 'policy.manage',
    name: '管理假勤政策',
    description: '修改假勤政策設定',
  },
  {
    permKey: 'leave.interview.record',
    module: 'leave',
    action: 'interview.record',
    name: '紀錄事假面談',
    description: '填寫事假面談紀錄',
  },
  {
    permKey: 'staffingRequirement.view',
    module: 'staffingRequirement',
    action: 'view',
    name: '查看人力需求',
    description: '檢視案場班別最低勤務人數',
  },
  {
    permKey: 'staffingRequirement.manage',
    module: 'staffingRequirement',
    action: 'manage',
    name: '管理人力需求',
    description: '建立、修改或停用案場班別最低勤務人數',
  },
  {
    permKey: 'qrAsset.view',
    module: 'qrAsset',
    action: 'view',
    name: '查看 QR 資產',
    description: '檢視永久 QR 資產中心',
  },
  {
    permKey: 'qrAsset.create',
    module: 'qrAsset',
    action: 'create',
    name: '建立 QR 資產',
    description: '為人員或案場建立永久 QR',
  },
  {
    permKey: 'qrAsset.deactivate',
    module: 'qrAsset',
    action: 'deactivate',
    name: '停用 QR 資產',
    description: '手動停用永久 QR',
  },
  {
    permKey: 'qrAsset.reactivate',
    module: 'qrAsset',
    action: 'reactivate',
    name: '重新啟用 QR 資產',
    description: '重新啟用已停用的 QR',
  },
  {
    permKey: 'qrAsset.export',
    module: 'qrAsset',
    action: 'export',
    name: '匯出 QR 資產',
    description: '匯出單張 QR 圖片',
  },
  {
    permKey: 'qrScan.use',
    module: 'qrScan',
    action: 'use',
    name: '使用 QR 掃描',
    description: '掃描勤管系統永久 QR',
  },
  {
    permKey: 'qrScan.viewHistory',
    module: 'qrScan',
    action: 'viewHistory',
    name: '查看掃描紀錄',
    description: '檢視 QR 掃描紀錄',
  },
  {
    permKey: 'employeeQr.viewOwn',
    module: 'employeeQr',
    action: 'viewOwn',
    name: '查看自己的人員 QR',
    description: '檢視本人永久人員 QR',
  },
] as const;

export function permissionKey(module: string, action: string): string {
  return `${module}.${action}`;
}

export function buildPermissionCatalog(): Array<{
  permKey: string;
  module: string;
  action: string;
  name: string;
  description: string;
}> {
  const catalog: Array<{
    permKey: string;
    module: string;
    action: string;
    name: string;
    description: string;
  }> = [];

  for (const mod of PERMISSION_MODULES) {
    for (const action of PERMISSION_ACTIONS) {
      catalog.push({
        permKey: permissionKey(mod.key, action),
        module: mod.key,
        action,
        name: `${mod.name} · ${actionLabel(action)}`,
        description: `${mod.name}模組的${actionLabel(action)}權限`,
      });
    }
  }

  for (const extra of EXTRA_PERMISSIONS) {
    catalog.push({ ...extra });
  }

  return catalog;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    view: '檢視',
    create: '新增',
    update: '修改',
    delete: '刪除',
    export: '匯出',
    approve: '核准',
    viewSensitive: '檢視敏感資料',
    viewHistory: '檢視歷史',
    viewAuditLog: '檢視稽核紀錄',
  };
  return map[action] ?? action;
}

export const MANAGER_DEFAULT_PERMISSIONS = [
  'users.view',
  'users.create',
  'users.update',
  'users.approve',
  'users.viewHistory',
  'sites.view',
  'sites.create',
  'sites.update',
  'sites.assign',
  'roles.view',
  'permissions.view',
  'tenants.view',
  'tenants.update',
  'audit.view',
  'accounts.view',
  'accounts.approve',
  'accounts.update',
  'schedule.viewOwn',
  'schedule.view',
  'schedule.create',
  'schedule.update',
  'schedule.cancel',
  'attendance.clock',
  'attendance.viewOwn',
  'attendance.view',
  'attendance.correct.request',
  'attendance.correct.approve',
  'workSession.start',
  'workSession.end',
  'workSession.startUnscheduled',
  'workSession.view',
  'workSession.forceEnd',
  'leave.viewOwn',
  'leave.request',
  'leave.attachment.upload',
  'leave.view',
  'leave.approve',
  'leave.reject',
  'leave.return',
  'leave.attachment.view',
  'leave.balance.view',
  'leave.policy.view',
  'leave.policy.manage',
  'leave.interview.record',
  'staffingRequirement.view',
  'staffingRequirement.manage',
  'qrAsset.view',
  'qrAsset.create',
  'qrAsset.deactivate',
  'qrAsset.reactivate',
  'qrAsset.export',
  'qrScan.use',
  'qrScan.viewHistory',
] as const;

export const STAFF_DEFAULT_PERMISSIONS = [
  'sites.view',
  'tenants.view',
  'users.view',
  'schedule.viewOwn',
  'attendance.clock',
  'attendance.viewOwn',
  'attendance.correct.request',
  'workSession.start',
  'workSession.end',
  'workSession.view',
  'leave.viewOwn',
  'leave.request',
  'leave.attachment.upload',
  'leave.balance.viewOwn',
  'employeeQr.viewOwn',
  'qrScan.use',
] as const;
