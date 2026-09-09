export const PARKING_SPACE_TYPES = [
  'private',
  'common',
  'visitor',
  'temporary',
  'accessible',
  'loading',
  'motorcycle',
  'other',
] as const;
export type ParkingSpaceType = (typeof PARKING_SPACE_TYPES)[number];
export const PARKING_SPACE_TYPE_LABELS: Record<ParkingSpaceType, string> = {
  private: '私人車位',
  common: '公共車位',
  visitor: '訪客車位',
  temporary: '臨停車位',
  accessible: '無障礙車位',
  loading: '卸貨車位',
  motorcycle: '機車位',
  other: '其他',
};

export const PARKING_VEHICLE_TYPES = ['car', 'motorcycle', 'mixed'] as const;
export type ParkingVehicleType = (typeof PARKING_VEHICLE_TYPES)[number];
export const PARKING_VEHICLE_TYPE_LABELS: Record<ParkingVehicleType, string> = {
  car: '汽車',
  motorcycle: '機車',
  mixed: '汽機車混合',
};

export const PARKING_SPACE_STATUSES = ['active', 'inactive', 'maintenance'] as const;
export type ParkingSpaceStatus = (typeof PARKING_SPACE_STATUSES)[number];
export const PARKING_SPACE_STATUS_LABELS: Record<ParkingSpaceStatus, string> = {
  active: '啟用',
  inactive: '停用',
  maintenance: '維修中',
};

export const PARKING_ASSIGNMENT_TYPES = ['owned', 'leased', 'authorized', 'temporary', 'common_use'] as const;
export type ParkingAssignmentType = (typeof PARKING_ASSIGNMENT_TYPES)[number];
export const PARKING_ASSIGNMENT_TYPE_LABELS: Record<ParkingAssignmentType, string> = {
  owned: '持有',
  leased: '租賃',
  authorized: '授權使用',
  temporary: '暫時指派',
  common_use: '公共使用',
};

export const RESIDENT_VEHICLE_TYPES = ['car', 'motorcycle', 'other'] as const;
export type ResidentVehicleType = (typeof RESIDENT_VEHICLE_TYPES)[number];
export const RESIDENT_VEHICLE_TYPE_LABELS: Record<ResidentVehicleType, string> = {
  car: '汽車',
  motorcycle: '機車',
  other: '其他',
};

export const RESIDENT_VEHICLE_STATUSES = ['active', 'inactive', 'removed'] as const;
export type ResidentVehicleStatus = (typeof RESIDENT_VEHICLE_STATUSES)[number];
export const RESIDENT_VEHICLE_STATUS_LABELS: Record<ResidentVehicleStatus, string> = {
  active: '使用中',
  inactive: '停用',
  removed: '已移除',
};

export const VEHICLE_ACCESS_TYPES = [
  'resident',
  'visitor',
  'vendor',
  'delivery',
  'temporary',
  'moving',
  'construction',
  'other',
] as const;
export type VehicleAccessType = (typeof VEHICLE_ACCESS_TYPES)[number];
export const VEHICLE_ACCESS_TYPE_LABELS: Record<VehicleAccessType, string> = {
  resident: '住戶車輛',
  visitor: '訪客車輛',
  vendor: '廠商',
  delivery: '外送',
  temporary: '臨停',
  moving: '搬家',
  construction: '工程',
  other: '其他',
};

export const VEHICLE_ACCESS_STATUSES = ['active', 'expired', 'cancelled'] as const;
export type VehicleAccessStatus = (typeof VEHICLE_ACCESS_STATUSES)[number];
export const VEHICLE_ACCESS_STATUS_LABELS: Record<VehicleAccessStatus, string> = {
  active: '有效',
  expired: '已過期',
  cancelled: '已取消',
};

export const VEHICLE_MOVEMENT_EVENT_KINDS = ['movement', 'correction', 'void', 'reversal'] as const;
export type VehicleMovementEventKind = (typeof VEHICLE_MOVEMENT_EVENT_KINDS)[number];
export const VEHICLE_MOVEMENT_EVENT_LABELS: Record<VehicleMovementEventKind, string> = {
  movement: '進出',
  correction: '更正',
  void: '作廢',
  reversal: '沖正',
};

export const PARKING_OCCUPANCY_STATUSES = ['occupied', 'released', 'overstayed', 'violation', 'corrected'] as const;
export type ParkingOccupancyStatus = (typeof PARKING_OCCUPANCY_STATUSES)[number];
export const PARKING_OCCUPANCY_STATUS_LABELS: Record<ParkingOccupancyStatus, string> = {
  occupied: '占用中',
  released: '已離場',
  overstayed: '逾時',
  violation: '異常占用',
  corrected: '已更正',
};

export const PARKING_OCCUPANCY_SOURCES = ['manual', 'guard', 'future_lpr', 'qr'] as const;
export type ParkingOccupancySource = (typeof PARKING_OCCUPANCY_SOURCES)[number];

export const PARKING_VIOLATION_TYPES = [
  'unauthorized_space',
  'visitor_overstay',
  'no_pass',
  'wrong_space',
  'blocking',
  'fire_lane',
  'accessible_misuse',
  'other',
] as const;
export type ParkingViolationType = (typeof PARKING_VIOLATION_TYPES)[number];
export const PARKING_VIOLATION_TYPE_LABELS: Record<ParkingViolationType, string> = {
  unauthorized_space: '占用他人車位',
  visitor_overstay: '臨停逾時',
  no_pass: '無通行證',
  wrong_space: '停錯車位',
  blocking: '阻擋通道',
  fire_lane: '占用消防通道',
  accessible_misuse: '誤用無障礙車位',
  other: '其他',
};

export const PARKING_VIOLATION_SEVERITIES = ['general', 'important', 'urgent'] as const;
export type ParkingViolationSeverity = (typeof PARKING_VIOLATION_SEVERITIES)[number];
export const PARKING_VIOLATION_SEVERITY_LABELS: Record<ParkingViolationSeverity, string> = {
  general: '一般',
  important: '重要',
  urgent: '緊急',
};

export const PARKING_VIOLATION_STATUSES = ['open', 'processing', 'resolved', 'voided'] as const;
export type ParkingViolationStatus = (typeof PARKING_VIOLATION_STATUSES)[number];
export const PARKING_VIOLATION_STATUS_LABELS: Record<ParkingViolationStatus, string> = {
  open: '未處理',
  processing: '處理中',
  resolved: '已結案',
  voided: '已作廢',
};

export const MANAGED_KEY_TYPES = ['physical', 'card', 'remote', 'other'] as const;
export type ManagedKeyType = (typeof MANAGED_KEY_TYPES)[number];
export const MANAGED_KEY_TYPE_LABELS: Record<ManagedKeyType, string> = {
  physical: '實體鑰匙',
  card: '卡片',
  remote: '遙控器',
  other: '其他',
};

export const MANAGED_KEY_STATUSES = ['available', 'checked_out', 'lost', 'damaged', 'inactive'] as const;
export type ManagedKeyStatus = (typeof MANAGED_KEY_STATUSES)[number];
export const MANAGED_KEY_STATUS_LABELS: Record<ManagedKeyStatus, string> = {
  available: '可借用',
  checked_out: '已借出',
  lost: '遺失',
  damaged: '損壞',
  inactive: '停用',
};

export const KEY_TRANSACTION_TYPES = ['checkout', 'return', 'correction', 'lost', 'damaged'] as const;
export type KeyTransactionType = (typeof KEY_TRANSACTION_TYPES)[number];
export const KEY_TRANSACTION_TYPE_LABELS: Record<KeyTransactionType, string> = {
  checkout: '借出',
  return: '歸還',
  correction: '更正',
  lost: '遺失',
  damaged: '損壞',
};

export const LOAN_BORROWER_TYPES = ['staff', 'resident', 'vendor', 'other'] as const;
export type LoanBorrowerType = (typeof LOAN_BORROWER_TYPES)[number];
export const LOAN_BORROWER_TYPE_LABELS: Record<LoanBorrowerType, string> = {
  staff: '勤務人員',
  resident: '住戶',
  vendor: '廠商',
  other: '其他',
};

export const LOAN_ITEM_STATUSES = ['active', 'inactive', 'maintenance'] as const;
export type LoanItemStatus = (typeof LOAN_ITEM_STATUSES)[number];
export const LOAN_ITEM_STATUS_LABELS: Record<LoanItemStatus, string> = {
  active: '可借用',
  inactive: '停用',
  maintenance: '維修中',
};

export const ITEM_LOAN_TRANSACTION_TYPES = ['borrow', 'return', 'correction', 'lost', 'damaged'] as const;
export type ItemLoanTransactionType = (typeof ITEM_LOAN_TRANSACTION_TYPES)[number];
export const ITEM_LOAN_TRANSACTION_TYPE_LABELS: Record<ItemLoanTransactionType, string> = {
  borrow: '借出',
  return: '歸還',
  correction: '更正',
  lost: '遺失',
  damaged: '損壞',
};

export const DEFAULT_VISITOR_MAX_DURATION_MINUTES = 120;

export const PHASE3B_PERMISSION_KEYS = [
  'parkingSpace.view',
  'parkingSpace.manage',
  'parkingAssignment.view',
  'parkingAssignment.manage',
  'vehicle.view',
  'vehicle.manage',
  'vehicleAccess.view',
  'vehicleAccess.register',
  'vehicleAccess.check',
  'parkingOccupancy.view',
  'parkingOccupancy.manage',
  'parkingViolation.view',
  'parkingViolation.create',
  'parkingViolation.manage',
  'key.view',
  'key.manage',
  'key.checkout',
  'key.return',
  'loanItem.view',
  'loanItem.manage',
  'loanItem.borrow',
  'loanItem.return',
  'mobilityDashboard.view',
] as const;

export const PHASE3B_STAFF_PERMISSION_KEYS = [
  'parkingSpace.view',
  'parkingAssignment.view',
  'vehicle.view',
  'vehicleAccess.view',
  'vehicleAccess.register',
  'vehicleAccess.check',
  'parkingOccupancy.view',
  'parkingOccupancy.manage',
  'parkingViolation.view',
  'parkingViolation.create',
  'key.view',
  'key.checkout',
  'key.return',
  'loanItem.view',
  'loanItem.borrow',
  'loanItem.return',
] as const;

export function formatParkingSpaceLabel(input: {
  zone?: string | null;
  floor?: string | null;
  spaceNo: string;
  displayName?: string | null;
}): string {
  if (input.displayName?.trim()) return input.displayName.trim();
  const parts = [input.zone?.trim(), input.floor?.trim(), input.spaceNo.trim()].filter(Boolean);
  return parts.join('-') || input.spaceNo;
}
