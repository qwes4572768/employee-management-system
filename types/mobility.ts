import type {
  ItemLoanTransactionType,
  KeyTransactionType,
  LoanBorrowerType,
  LoanItemStatus,
  ManagedKeyStatus,
  ManagedKeyType,
  ParkingAssignmentType,
  ParkingOccupancySource,
  ParkingOccupancyStatus,
  ParkingSpaceStatus,
  ParkingSpaceType,
  ParkingVehicleType,
  ParkingViolationSeverity,
  ParkingViolationStatus,
  ParkingViolationType,
  ResidentVehicleStatus,
  ResidentVehicleType,
  VehicleAccessStatus,
  VehicleAccessType,
  VehicleMovementEventKind,
} from '@/constants/mobility';
import type { SyncMeta } from './models';

export interface ParkingSpace extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  zone: string | null;
  floor: string | null;
  spaceNo: string;
  displayName: string;
  spaceType: ParkingSpaceType;
  vehicleType: ParkingVehicleType;
  status: ParkingSpaceStatus;
  notes: string | null;
}

export interface ParkingAssignment extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  parkingSpaceId: string;
  unitId: string | null;
  residentId: string | null;
  assignmentType: ParkingAssignmentType;
  startsAt: string | null;
  endsAt: string | null;
  isCurrent: boolean;
  notes: string | null;
}

export interface SiteParkingSettings extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  visitorMaxDurationMinutes: number;
  temporaryMaxDurationMinutes: number;
}

export interface ResidentVehicle extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  residentId: string | null;
  unitId: string | null;
  plateNo: string;
  plateNoNormalized: string;
  vehicleType: ResidentVehicleType;
  brand: string | null;
  model: string | null;
  color: string | null;
  isPrimary: boolean;
  status: ResidentVehicleStatus;
  allowDuplicate: boolean;
  notes: string | null;
}

export interface VehicleAccessPass extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  vehicleId: string | null;
  unitId: string | null;
  visitorPassId: string | null;
  plateNoSnapshot: string;
  plateNoNormalized: string;
  accessType: VehicleAccessType;
  validFrom: string | null;
  validUntil: string | null;
  status: VehicleAccessStatus;
  notes: string | null;
}

export interface VehicleMovement extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  vehicleId: string | null;
  accessPassId: string | null;
  plateNoSnapshot: string;
  plateNoNormalized: string;
  direction: 'in' | 'out';
  gateName: string | null;
  occurredAt: string;
  processedBy: string | null;
  photoUri: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  timeSource: 'device' | 'server';
  deviceTime: string;
  serverTime: string | null;
  eventKind: VehicleMovementEventKind;
  correctsId: string | null;
  reason: string | null;
}

export interface ParkingOccupancy extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  parkingSpaceId: string;
  vehicleId: string | null;
  accessPassId: string | null;
  plateNoSnapshot: string;
  occupiedFrom: string;
  occupiedUntil: string | null;
  status: ParkingOccupancyStatus;
  source: ParkingOccupancySource;
  confidence: number | null;
  captureImageUri: string | null;
}

export interface ParkingViolation extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  parkingSpaceId: string | null;
  vehicleId: string | null;
  occupancyId: string | null;
  plateNoSnapshot: string;
  violationType: ParkingViolationType;
  severity: ParkingViolationSeverity;
  description: string | null;
  status: ParkingViolationStatus;
  reportedBy: string | null;
  reportedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  photoUri: string | null;
}

export interface ManagedKey extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  keyCode: string;
  name: string;
  description: string | null;
  storageLocation: string | null;
  keyType: ManagedKeyType;
  status: ManagedKeyStatus;
  qrAssetId: string | null;
}

export interface KeyTransaction {
  id: string;
  tenantId: string;
  siteId: string;
  keyId: string;
  transactionType: KeyTransactionType;
  borrowerType: LoanBorrowerType;
  borrowerUserId: string | null;
  borrowerResidentId: string | null;
  borrowerNameSnapshot: string;
  purpose: string | null;
  checkedOutAt: string | null;
  dueAt: string | null;
  returnedAt: string | null;
  conditionOut: string | null;
  conditionIn: string | null;
  processedBy: string | null;
  note: string | null;
  compensationReviewRequired: boolean;
  correctsId: string | null;
  createdAt: string;
  createdBy: string | null;
  syncStatus: string;
  deviceId: string | null;
}

export interface LoanItem extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  itemCode: string;
  name: string;
  category: string | null;
  totalQuantity: number;
  availableQuantity: number;
  storageLocation: string | null;
  requiresDeposit: boolean;
  depositReferenceAmount: number | null;
  status: LoanItemStatus;
  qrAssetId: string | null;
  notes: string | null;
}

export interface ItemLoanTransaction {
  id: string;
  tenantId: string;
  siteId: string;
  itemId: string;
  transactionType: ItemLoanTransactionType;
  quantity: number;
  borrowerType: LoanBorrowerType;
  borrowerUserId: string | null;
  borrowerResidentId: string | null;
  borrowerNameSnapshot: string;
  purpose: string | null;
  borrowedAt: string | null;
  dueAt: string | null;
  returnedAt: string | null;
  conditionOut: string | null;
  conditionIn: string | null;
  processedBy: string | null;
  photoUri: string | null;
  note: string | null;
  relatedTransactionId: string | null;
  compensationReviewRequired: boolean;
  createdAt: string;
  createdBy: string | null;
  syncStatus: string;
  deviceId: string | null;
}

export interface MobilityHomeCard {
  vehiclesOnSite: number;
  visitorVehiclesOnSite: number;
  occupiedSpaces: number;
  totalActiveSpaces: number;
  occupancyRate: number;
  openViolations: number;
  overstayedOccupancies: number;
  keysCheckedOut: number;
  keysOverdue: number;
  itemsLoaned: number;
  itemsOverdue: number;
}
