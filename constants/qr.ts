export const QR_ASSET_TYPES = {
  EMPLOYEE: 'employee',
  SITE: 'site',
  PATROL_POINT: 'patrol_point',
  EQUIPMENT: 'equipment',
  KEY_ITEM: 'key_item',
} as const;

export type QrAssetType = (typeof QR_ASSET_TYPES)[keyof typeof QR_ASSET_TYPES];

export const QR_ASSET_TYPE_LABELS: Record<QrAssetType, string> = {
  employee: '人員 QR',
  site: '案場 QR',
  patrol_point: '巡邏點 QR',
  equipment: '設備 QR',
  key_item: '鑰匙 / 物品 QR',
};

export const QR_PHASE_COMPLETE_TYPES: QrAssetType[] = [QR_ASSET_TYPES.EMPLOYEE, QR_ASSET_TYPES.SITE];

export const QR_ASSET_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type QrAssetStatus = (typeof QR_ASSET_STATUSES)[keyof typeof QR_ASSET_STATUSES];

export const QR_SCAN_RESULTS = {
  VALID: 'valid',
  INVALID: 'invalid',
  INACTIVE: 'inactive',
  UNAUTHORIZED: 'unauthorized',
  CROSS_TENANT: 'cross_tenant',
} as const;

export type QrScanResult = (typeof QR_SCAN_RESULTS)[keyof typeof QR_SCAN_RESULTS];

export const QR_SCAN_RESULT_LABELS: Record<QrScanResult, string> = {
  valid: '有效',
  invalid: '無效',
  inactive: '已停用',
  unauthorized: '無權限',
  cross_tenant: '跨公司',
};

export const QR_PAYLOAD_PREFIX = 'QINGUAN:v1:';
export const QR_PAYLOAD_VERSION = 1;

export const QR_SCAN_COOLDOWN_MS = 2500;

export const QR_DEACTIVATE_REASONS = [
  { value: 'qr_leaked', label: 'QR 外洩' },
  { value: 'reissue', label: '重新製作' },
  { value: 'site_closed', label: '案場結束' },
  { value: 'sticker_damaged', label: '貼紙損毀' },
  { value: 'other', label: '其他' },
] as const;

export function isQrAssetType(value: string): value is QrAssetType {
  return (Object.values(QR_ASSET_TYPES) as string[]).includes(value);
}
