import type { QrAssetStatus, QrAssetType, QrScanResult } from '@/constants/qr';
import type { Gender, SyncMeta } from './models';

export interface QrAsset extends SyncMeta {
  id: string;
  tenantId: string;
  siteId: string | null;
  assetType: QrAssetType;
  targetType: QrAssetType;
  targetId: string;
  qrCode: string;
  displayName: string;
  status: QrAssetStatus;
  deactivatedBy: string | null;
  deactivatedAt: string | null;
  deactivateReason: string | null;
  lastScanAt: string | null;
  scanCount: number;
}

export interface QrScanLog {
  id: string;
  tenantId: string;
  siteId: string | null;
  qrAssetId: string | null;
  scannerUserId: string | null;
  scannerNameSnapshot: string;
  scannerRoleSnapshot: string | null;
  scannedCode: string;
  scanResult: QrScanResult;
  scannedAt: string;
  latitude: number | null;
  longitude: number | null;
  deviceId: string | null;
  appVersion: string | null;
  createdAt: string;
}

export interface EmployeeQrProfile {
  userId: string;
  photoUri: string | null;
  fullName: string;
  employeeNo: string | null;
  gender: Gender;
  hireDate: string | null;
  jobTitle: string | null;
  companyName: string | null;
  authorizedSiteNames: string[];
  dutyStatus: 'not_arrived' | 'clocked_in' | 'on_duty' | 'duty_ended' | 'late' | 'exception' | null;
  dutyStatusLabel: string | null;
  todayShiftName: string | null;
  currentSiteName: string | null;
  clockedIn: boolean;
  onDuty: boolean;
}

export interface SiteQrProfile {
  siteId: string;
  name: string;
  siteCode: string;
  status: string;
  createdByName: string | null;
  createdAt: string;
  lastScanAt: string | null;
}

export interface QrScanOutcome {
  scanResult: QrScanResult;
  message: string;
  log: QrScanLog | null;
  debounced: boolean;
  asset: QrAsset | null;
  employee: EmployeeQrProfile | null;
  site: SiteQrProfile | null;
  deactivatedAt: string | null;
}
