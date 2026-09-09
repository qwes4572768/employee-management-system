import type { SyncStatus } from '@/types';
import { boolFromSql } from '@/utils/data';

export interface SyncRow {
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  device_id: string | null;
}

export function mapSync<T extends SyncRow>(row: T) {
  return {
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version,
    syncStatus: row.sync_status as SyncStatus,
    deviceId: row.device_id,
  };
}

export { boolFromSql };
