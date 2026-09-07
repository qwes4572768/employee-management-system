import type {
  OccupancyType,
  ParcelKind,
  ParcelStatus,
  ResidentRelationKey,
  ResidentStatus,
  UnitStatus,
  VisitorKind,
  VisitorMovementEventKind,
  VisitorPassStatus,
} from '@/constants/community';
import type { SyncMeta } from './models';

export interface SiteUnit extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  building: string | null;
  floor: string | null;
  unitNo: string;
  displayName: string;
  occupancyType: OccupancyType;
  status: UnitStatus;
  notes: string | null;
}

export interface Resident extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  fullName: string;
  phone: string | null;
  gender: string;
  idLast4: string | null;
  photoUri: string | null;
  moveInAt: string | null;
  moveOutAt: string | null;
  status: ResidentStatus;
  notes: string | null;
}

export interface ResidentOccupancy extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  unitId: string;
  residentId: string;
  relationKey: ResidentRelationKey;
  relationLabelSnapshot: string;
  startsAt: string | null;
  endsAt: string | null;
  isCurrent: boolean;
  isPrimary: boolean;
  notes: string | null;
}

export interface VisitorPass extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  unitId: string;
  hostResidentId: string | null;
  visitorKind: VisitorKind;
  visitorName: string;
  visitorPhone: string | null;
  visitorCompany: string | null;
  idLast4: string | null;
  purpose: string | null;
  expectedAt: string | null;
  expiresAt: string | null;
  status: VisitorPassStatus;
  hostNameSnapshot: string;
  unitLabelSnapshot: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  timeSource: 'device' | 'server';
  deviceTime: string;
  serverTime: string | null;
}

export interface VisitorMovement extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  visitorPassId: string;
  direction: 'in' | 'out';
  occurredAt: string;
  processedBy: string | null;
  photoUri: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  eventKind: VisitorMovementEventKind;
  correctsId: string | null;
  reason: string | null;
}

export interface Parcel extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string;
  unitId: string;
  residentId: string | null;
  trackingNo: string | null;
  courierName: string | null;
  parcelKind: ParcelKind;
  locationNote: string | null;
  photoUri: string | null;
  status: ParcelStatus;
  recipientNameSnapshot: string;
  unitLabelSnapshot: string;
  registeredAt: string;
  notifiedAt: string | null;
  pickupAt: string | null;
  pickupByName: string | null;
  pickupPhotoUri: string | null;
  pickupSignatureNote: string | null;
  pickedUpByStaffId: string | null;
  timeSource: 'device' | 'server';
  deviceTime: string;
  serverTime: string | null;
}

export interface ParcelEvent extends SyncMeta {
  id: string;
  tenantId: string;
  parcelId: string;
  action: string;
  actorUserId: string | null;
  actorNameSnapshot: string;
  note: string | null;
  photoUri: string | null;
  correctsEventId: string | null;
  reason: string | null;
}

export interface CommunityHomeCard {
  visitorsOnSite: number;
  parcelsWaiting: number;
  visitorsToday: number;
  parcelsToday: number;
}
