import { migration001 } from './001_initial';
import { migration002 } from './002_integrity_constraints';

export const CURRENT_SCHEMA_VERSION = 2;

export const migrations = [migration001, migration002];

export { permissionIdForKey, MIGRATION_001_SQL, type Migration } from './001_initial';
