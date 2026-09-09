export const UNIT_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type UnitStatus = (typeof UNIT_STATUSES)[keyof typeof UNIT_STATUSES];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  active: '啟用',
  inactive: '停用',
};

export const OCCUPANCY_TYPES = {
  VACANT: 'vacant',
  OWNER_OCCUPIED: 'owner_occupied',
  RENTED: 'rented',
  MIXED: 'mixed',
} as const;

export type OccupancyType = (typeof OCCUPANCY_TYPES)[keyof typeof OCCUPANCY_TYPES];

export const OCCUPANCY_TYPE_LABELS: Record<OccupancyType, string> = {
  vacant: '空戶',
  owner_occupied: '自住',
  rented: '出租',
  mixed: '混合',
};

export const RESIDENT_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  MOVED_OUT: 'moved_out',
} as const;

export type ResidentStatus = (typeof RESIDENT_STATUSES)[keyof typeof RESIDENT_STATUSES];

export const RESIDENT_STATUS_LABELS: Record<ResidentStatus, string> = {
  active: '在住',
  inactive: '停用',
  moved_out: '已遷出',
};

export const RESIDENT_RELATION_KEYS = [
  'owner',
  'tenant',
  'family',
  'occupant',
  'agent',
] as const;

export type ResidentRelationKey = (typeof RESIDENT_RELATION_KEYS)[number];

export const RESIDENT_RELATION_LABELS: Record<ResidentRelationKey, string> = {
  owner: '所有人',
  tenant: '租戶',
  family: '眷屬',
  occupant: '同住',
  agent: '代理人',
};

export const VISITOR_KINDS = [
  'guest',
  'vendor',
  'delivery',
  'temporary',
] as const;

export type VisitorKind = (typeof VISITOR_KINDS)[number];

export const VISITOR_KIND_LABELS: Record<VisitorKind, string> = {
  guest: '訪客',
  vendor: '廠商',
  delivery: '外送',
  temporary: '臨時人員',
};

export const VISITOR_PASS_STATUSES = {
  REGISTERED: 'registered',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export type VisitorPassStatus = (typeof VISITOR_PASS_STATUSES)[keyof typeof VISITOR_PASS_STATUSES];

export const VISITOR_PASS_STATUS_LABELS: Record<VisitorPassStatus, string> = {
  registered: '已登記',
  checked_in: '在場',
  checked_out: '已離場',
  cancelled: '已取消',
  expired: '已過期',
};

export const PARCEL_KINDS = [
  'general',
  'registered',
  'refrigerated',
  'oversized',
] as const;

export type ParcelKind = (typeof PARCEL_KINDS)[number];

export const PARCEL_KIND_LABELS: Record<ParcelKind, string> = {
  general: '一般包裹',
  registered: '掛號／文件',
  refrigerated: '冷藏',
  oversized: '超大件',
};

export const PARCEL_STATUSES = {
  REGISTERED: 'registered',
  NOTIFIED: 'notified',
  PICKED_UP: 'picked_up',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
} as const;

export type ParcelStatus = (typeof PARCEL_STATUSES)[keyof typeof PARCEL_STATUSES];

export const PARCEL_STATUS_LABELS: Record<ParcelStatus, string> = {
  registered: '待領取',
  notified: '已通知',
  picked_up: '已領取',
  returned: '已退件',
  cancelled: '已取消',
};

export const PHASE3A_PERMISSION_KEYS = [
  'unit.view',
  'unit.manage',
  'resident.view',
  'resident.manage',
  'visitor.view',
  'visitor.register',
  'visitor.check',
  'visitor.cancel',
  'parcel.view',
  'parcel.register',
  'parcel.pickup',
  'parcel.manage',
  'communityDashboard.view',
] as const;

export const VISITOR_MOVEMENT_EVENT_KINDS = ['movement', 'correction', 'void'] as const;
export type VisitorMovementEventKind = (typeof VISITOR_MOVEMENT_EVENT_KINDS)[number];

export const VISITOR_MOVEMENT_EVENT_LABELS: Record<VisitorMovementEventKind, string> = {
  movement: '進出',
  correction: '更正',
  void: '作廢',
};

export const PHASE3A_STAFF_PERMISSION_KEYS = [
  'unit.view',
  'resident.view',
  'visitor.view',
  'visitor.register',
  'visitor.check',
  'parcel.view',
  'parcel.register',
  'parcel.pickup',
] as const;

export function formatUnitLabel(input: { building?: string | null; floor?: string | null; unitNo: string; displayName?: string | null }): string {
  if (input.displayName?.trim()) return input.displayName.trim();
  const parts = [input.building?.trim(), input.floor?.trim() ? `${input.floor.trim()}樓` : null, input.unitNo.trim()].filter(Boolean);
  return parts.join(' ');
}
