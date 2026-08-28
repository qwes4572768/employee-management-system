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
] as const;

export const STAFF_DEFAULT_PERMISSIONS = [
  'sites.view',
  'tenants.view',
  'users.view',
] as const;
