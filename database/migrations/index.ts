import { migration001 } from './001_initial';
import { migration002 } from './002_integrity_constraints';
import { migration003 } from './003_workforce_attendance';
import { migration004 } from './004_site_shift_requirements';
import { migration005 } from './005_qr_asset_center';
import { migration006 } from './006_smart_patrol';
import { migration007 } from './007_inspection_evaluation';
import { migration008 } from './008_community_center';
import { migration009 } from './009_resident_master_normalization';
import { migration010 } from './010_vehicle_parking_key_assets';

export const CURRENT_SCHEMA_VERSION = 10;

export const migrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
];

export { permissionIdForKey, MIGRATION_001_SQL, type Migration } from './001_initial';
