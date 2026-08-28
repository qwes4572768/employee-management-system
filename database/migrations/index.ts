import { migration001 } from './001_initial';
import { migration002 } from './002_integrity_constraints';
import { migration003 } from './003_workforce_attendance';

export const CURRENT_SCHEMA_VERSION = 3;

export const migrations = [migration001, migration002, migration003];

export { permissionIdForKey, MIGRATION_001_SQL, type Migration } from './001_initial';
