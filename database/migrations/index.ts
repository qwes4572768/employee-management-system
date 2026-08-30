import { migration001 } from './001_initial';
import { migration002 } from './002_integrity_constraints';
import { migration003 } from './003_workforce_attendance';
import { migration004 } from './004_site_shift_requirements';
import { migration005 } from './005_qr_asset_center';
import { migration006 } from './006_smart_patrol';

export const CURRENT_SCHEMA_VERSION = 6;

export const migrations = [migration001, migration002, migration003, migration004, migration005, migration006];

export { permissionIdForKey, MIGRATION_001_SQL, type Migration } from './001_initial';
