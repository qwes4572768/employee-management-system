import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { migration002 } from '@/database/migrations/002_integrity_constraints';
import { migration003 } from '@/database/migrations/003_workforce_attendance';
import { migration004 } from '@/database/migrations/004_site_shift_requirements';
import { migration005 } from '@/database/migrations/005_qr_asset_center';
import { migration006 } from '@/database/migrations/006_smart_patrol';
import { migration007 } from '@/database/migrations/007_inspection_evaluation';
import { migration008 } from '@/database/migrations/008_community_center';
import { migration009 } from '@/database/migrations/009_resident_master_normalization';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { getDatabase, setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { listNotifications } from '@/repositories/notificationRepository';
import { getQrAssetById } from '@/repositories/qrAssetRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { getDashboardSnapshot } from '@/services/dashboardService';
import {
  checkoutKeyForActor,
  createManagedKeyForActor,
  getManagedKeyForActor,
  listOverdueKeysForActor,
  notifyOverdueKeysForSite,
  reportKeyIssueForActor,
  returnKeyForActor,
} from '@/services/keyService';
import {
  borrowLoanItemForActor,
  createLoanItemForActor,
  getLoanItemForActor,
  listOverdueItemLoansForActor,
  reportLoanItemIssueForActor,
  returnLoanItemForActor,
} from '@/services/loanItemService';
import { getMobilityHomeCard } from '@/services/mobilityDashboardService';
import {
  addParkingAssignmentForActor,
  createParkingSpaceForActor,
  endParkingAssignmentForActor,
  getParkingSpaceForActor,
  listParkingAssignmentsForActor,
} from '@/services/parkingSpaceService';
import { createPatrolPoint } from '@/services/patrolPointService';
import { issuePatrolPointQr } from '@/services/qrAssetService';
import { createResidentWithOccupancy } from '@/services/residentService';
import { assignRoleToUser } from '@/services/roleService';
import { createSchedule, createShiftTemplate } from '@/services/scheduleService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { assignUserToSite, createSite } from '@/services/siteService';
import { createSiteUnit } from '@/services/unitService';
import {
  checkInVehicleForActor,
  checkOutVehicleForActor,
  correctVehicleMovementForActor,
  createResidentVehicleForActor,
  createVehicleAccessPassForActor,
  listParkingOccupanciesForActor,
  listParkingViolationsForActor,
  listVehicleMovementsForActor,
  occupyParkingSpaceForActor,
  refreshParkingOverstaysForSite,
  updateResidentVehicleForActor,
} from '@/services/vehicleService';
import { registerVisitorPass } from '@/services/visitorService';
import { formatDateTimeZh } from '@/utils/datetime';
import { createId } from '@/utils/id';
import { normalizePlateNumber } from '@/utils/plate';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p3b'): ActorContext {
  return {
    userId: null,
    fullName: '系統',
    account: 'system',
    roleSnapshot: 'SYSTEM',
    tenantId: null,
    siteId: null,
    deviceId: `device-${suffix}`,
    appVersion: '1.0.0',
  };
}

function asActor(
  user: { id: string; fullName: string; account: string; tenantId: string },
  siteId?: string | null,
  roleSnapshot = '企業總管理員',
): ActorContext {
  return {
    userId: user.id,
    fullName: user.fullName,
    account: user.account,
    roleSnapshot,
    tenantId: user.tenantId,
    siteId: siteId ?? null,
    deviceId: 'device-admin',
    appVersion: '1.0.0',
  };
}

async function expectFailure(fn: () => Promise<unknown>, needle: string, message: string) {
  try {
    await fn();
    throw new Error(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text === message) throw error;
    assert(text.includes(needle), `${message}: ${text}`);
  }
}

async function seed(name: string, account: string) {
  return bootstrapSystem({
    admin: {
      fullName: `${name}管理員`,
      phone: '0911000111',
      employeeNo: 'A001',
      gender: 'female',
      hireDate: '2019-03-01',
      jobTitle: '營運長',
      account,
      password: 'SafePass#9',
      confirmPassword: 'SafePass#9',
    },
    company: {
      officialName: `${name}保全股份有限公司`,
      shortName: name,
      taxId: '12345678',
      phone: '0222334455',
      industryType: 'security',
    },
    site: {
      siteCode: 'SITE-001',
      name: '中正名人巷',
      address: '台北市',
    },
    actor: systemActor(account),
  });
}

async function openDb() {
  const filename = path.join(os.tmpdir(), `qinguan-p3b-${createId()}.db`);
  const db = createBetterSqliteDatabase(filename);
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  return Object.assign(db, { filename });
}

async function createUser(
  adminActor: ActorContext,
  tenant: Tenant,
  input: { fullName: string; account: string; siteId: string; roleKey: 'STAFF' | 'MANAGER' },
) {
  const pending = await registerAccount(
    tenant,
    {
      fullName: input.fullName,
      phone: '0933000333',
      employeeNo: `E-${input.account}`,
      gender: 'male',
      hireDate: '2024-01-01',
      jobTitle: input.roleKey === 'MANAGER' ? '主管' : '保全員',
      account: input.account,
      password: 'GuardPass#1',
      confirmPassword: 'GuardPass#1',
    },
    systemActor(input.account),
  );
  await reviewAccount(adminActor, pending.id, 'active', null);
  const roles = await listRoles(tenant.id);
  const role = roles.find((item) => item.roleKey === input.roleKey);
  assert(role, `${input.roleKey} missing`);
  await assignRoleToUser(adminActor, {
    tenantId: tenant.id,
    userId: pending.id,
    roleId: role.id,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: input.fullName,
    roleName: role.name,
  });
  await assignUserToSite(adminActor, {
    tenantId: tenant.id,
    userId: pending.id,
    siteId: input.siteId,
    startsAt: null,
    expiresAt: null,
    isPermanent: true,
    targetName: input.fullName,
    siteName: 'site',
  });
  const user = await findAccountGlobally(input.account);
  assert(user, 'user missing');
  return user;
}

async function applyMigration(db: ReturnType<typeof createBetterSqliteDatabase>, version: number, name: string, up: unknown) {
  if (typeof up === 'function') {
    await (up as (database: typeof db) => Promise<void>)(db);
  } else if (typeof up === 'string') {
    await db.exec(up);
  }
  await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
    version,
    name,
    new Date().toISOString(),
  ]);
}

async function applyThrough009(db: ReturnType<typeof createBetterSqliteDatabase>) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  await db.exec(MIGRATION_001_SQL);
  await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
    1,
    '001_initial',
    new Date().toISOString(),
  ]);
  await db.exec('PRAGMA foreign_keys = OFF;');
  await applyMigration(db, 2, '002_integrity_constraints', migration002.up);
  await applyMigration(db, 3, '003_workforce_attendance', migration003.up);
  await applyMigration(db, 4, '004_site_shift_requirements', migration004.up);
  await applyMigration(db, 5, '005_qr_asset_center', migration005.up);
  await applyMigration(db, 6, '006_smart_patrol', migration006.up);
  await applyMigration(db, 7, '007_inspection_evaluation', migration007.up);
  await applyMigration(db, 8, '008_community_center', migration008.up);
  await applyMigration(db, 9, '009_resident_master_normalization', migration009.up);
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(CURRENT_SCHEMA_VERSION === 10, 'schema version must be 10');
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'parking_spaces','parking_assignments','resident_vehicles','vehicle_access_passes','vehicle_movements',
      'parking_occupancies','parking_violations','managed_keys','key_transactions','loan_items','item_loan_transactions'
    )`,
  );
  assert(tables.length === 11, `phase 3b tables ${tables.length}`);

  const seeded = await seed('車位', 'p3b.admin');
  const admin = asActor(seeded.user);
  const siteA = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-A',
    name: '中正名人巷',
    address: '台北市',
  });
  const siteB = await createSite(admin, {
    tenantId: seeded.tenant.id,
    siteCode: 'SITE-B',
    name: '信義遠眺',
    address: '台北市',
  });
  const staffUser = await createUser(admin, seeded.tenant, {
    fullName: '李值班',
    account: 'li.p3b',
    siteId: siteA.id,
    roleKey: 'STAFF',
  });
  const staffActor = asActor(staffUser, siteA.id, '一般勤務人員');

  const emptyCard = await getMobilityHomeCard(admin, siteA.id);
  assert(emptyCard.vehiclesOnSite === 0 && emptyCard.keysOverdue === 0 && emptyCard.itemsOverdue === 0, 'empty stats are 0');

  const unitA = await createSiteUnit(admin, { siteId: siteA.id, building: 'A棟', floor: '5', unitNo: '1' });
  const unitB = await createSiteUnit(admin, { siteId: siteA.id, building: 'A棟', floor: '8', unitNo: '2' });
  const residentA = await createResidentWithOccupancy(admin, {
    unitId: unitA.id,
    fullName: '王先生',
    relationKey: 'owner',
    isPrimary: true,
  });

  const space01 = await createParkingSpaceForActor(admin, {
    siteId: siteA.id,
    zone: 'B1',
    floor: 'B1',
    spaceNo: '01',
    spaceType: 'private',
  });
  const space02 = await createParkingSpaceForActor(admin, {
    siteId: siteA.id,
    zone: 'B1',
    floor: 'B1',
    spaceNo: '02',
    spaceType: 'private',
  });
  await expectFailure(
    () => createParkingSpaceForActor(admin, { siteId: siteA.id, zone: 'B1', floor: 'B1', spaceNo: '01', spaceType: 'private' }),
    '此車位編號已存在',
    'duplicate space blocked',
  );

  const assign01 = await addParkingAssignmentForActor(admin, {
    parkingSpaceId: space01.id,
    unitId: unitA.id,
    assignmentType: 'owned',
  });
  const assign02 = await addParkingAssignmentForActor(admin, {
    parkingSpaceId: space02.id,
    unitId: unitA.id,
    assignmentType: 'owned',
  });
  assert(assign01.unitId === unitA.id && assign02.unitId === unitA.id, 'one unit two spaces');

  const space10 = await createParkingSpaceForActor(admin, {
    siteId: siteA.id,
    zone: 'B1',
    floor: 'B1',
    spaceNo: '10',
    spaceType: 'private',
  });
  const firstLease = await addParkingAssignmentForActor(admin, {
    parkingSpaceId: space10.id,
    unitId: unitA.id,
    assignmentType: 'leased',
    startsAt: '2026-01-01T00:00:00.000Z',
  });
  await expectFailure(
    () => addParkingAssignmentForActor(admin, { parkingSpaceId: space10.id, unitId: unitB.id, assignmentType: 'leased' }),
    '目前已有有效指派',
    'private exclusive current blocked',
  );
  await endParkingAssignmentForActor(admin, firstLease.id, { endsAt: '2026-06-30T00:00:00.000Z', reason: '租約到期' });
  const secondLease = await addParkingAssignmentForActor(admin, {
    parkingSpaceId: space10.id,
    unitId: unitB.id,
    assignmentType: 'leased',
    startsAt: '2026-07-01T00:00:00.000Z',
  });
  const history = await listParkingAssignmentsForActor(admin, space10.id);
  assert(history.length === 2, 'assignment history kept');
  assert(history.some((item) => item.id === firstLease.id && !item.isCurrent), 'old assignment retained');
  assert(history.some((item) => item.id === secondLease.id && item.isCurrent), 'new assignment current');

  const visitorSpace = await createParkingSpaceForActor(admin, {
    siteId: siteA.id,
    zone: 'G',
    floor: '1',
    spaceNo: 'V1',
    spaceType: 'visitor',
  });
  const visitorAssignments = await listParkingAssignmentsForActor(admin, visitorSpace.id);
  assert(visitorAssignments.length === 0, 'visitor space may have no assignment');

  const vehicle = await createResidentVehicleForActor(admin, {
    siteId: siteA.id,
    residentId: residentA.resident.id,
    unitId: unitA.id,
    plateNo: 'ABC-1234',
    vehicleType: 'car',
    brand: 'Toyota',
  });
  assert(vehicle.plateNoNormalized === 'ABC1234', 'plate stored normalized');
  await expectFailure(
    () =>
      createResidentVehicleForActor(admin, {
        siteId: siteA.id,
        residentId: residentA.resident.id,
        unitId: unitB.id,
        plateNo: 'XYZ-9999',
        vehicleType: 'car',
      }),
    '住戶在此戶別沒有有效關係',
    'occupancy mismatch blocked',
  );
  assert(normalizePlateNumber(' ａｂｃ－１２３４ ') === 'ABC1234', 'normalize fullwidth hyphen spaces');
  assert(normalizePlateNumber('abc 1234') === 'ABC1234', 'normalize spaces');
  await expectFailure(
    () =>
      createResidentVehicleForActor(admin, {
        siteId: siteA.id,
        plateNo: 'abc-1234',
        vehicleType: 'car',
      }),
    '相同車牌',
    'duplicate active plate blocked',
  );
  await updateResidentVehicleForActor(admin, vehicle.id, { status: 'removed' });
  const reused = await createResidentVehicleForActor(admin, {
    siteId: siteA.id,
    plateNo: 'ABC-1234',
    vehicleType: 'car',
    notes: '歷史車輛已移除後重新登錄',
  });
  assert(reused.id !== vehicle.id, 'removed plate can be reused');

  const visitor = await registerVisitorPass(staffActor, {
    siteId: siteA.id,
    unitId: unitA.id,
    visitorKind: 'guest',
    visitorName: '陳訪客',
    purpose: '探訪',
  });
  const visitorPass = await createVehicleAccessPassForActor(staffActor, {
    siteId: siteA.id,
    visitorPassId: visitor.id,
    plateNo: 'VIS-7788',
    accessType: 'visitor',
  });
  assert(visitorPass.visitorPassId === visitor.id, 'visitor vehicle pass linked');

  const checkIn = await checkInVehicleForActor(staffActor, {
    siteId: siteA.id,
    accessPassId: visitorPass.id,
    plateNo: 'VIS-7788',
  });
  assert(checkIn.movement.direction === 'in', 'vehicle in');
  await expectFailure(
    () => checkInVehicleForActor(staffActor, { siteId: siteA.id, accessPassId: visitorPass.id, plateNo: 'VIS-7788' }),
    '此車輛目前已在場內',
    'duplicate in blocked',
  );
  const checkOut = await checkOutVehicleForActor(staffActor, { siteId: siteA.id, plateNo: 'vis 7788' });
  assert(checkOut.movement.direction === 'out', 'vehicle out');
  await expectFailure(
    () => checkOutVehicleForActor(staffActor, { siteId: siteA.id, plateNo: 'VIS-7788' }),
    '查無有效進場紀錄',
    'out without in blocked',
  );

  const inAgain = await checkInVehicleForActor(staffActor, { siteId: siteA.id, plateNo: 'VIS-7788', accessPassId: visitorPass.id });
  await expectFailure(
    () => getDatabase().run('UPDATE vehicle_movements SET note = ? WHERE id = ?', ['tamper', inAgain.movement.id]),
    '不可修改或刪除',
    'movements cannot update',
  );
  await expectFailure(
    () => getDatabase().run('DELETE FROM vehicle_movements WHERE id = ?', [inAgain.movement.id]),
    '不可修改或刪除',
    'movements cannot delete',
  );
  const originalOccurred = inAgain.movement.occurredAt;
  const correction = await correctVehicleMovementForActor(admin, inAgain.movement.id, {
    occurredAt: '2026-09-09T01:00:00.000Z',
    reason: '進場時間打錯',
  });
  const movements = await listVehicleMovementsForActor(admin, { siteId: siteA.id, plateNo: 'VIS-7788' });
  const original = movements.find((item) => item.id === inAgain.movement.id);
  assert(original?.occurredAt === originalOccurred, 'original movement kept');
  assert(correction.eventKind === 'correction', 'correction appended');

  await occupyParkingSpaceForActor(admin, { parkingSpaceId: space01.id, plateNo: 'STR-0001' });
  const occupancies = await listParkingOccupanciesForActor(admin, siteA.id, true);
  const stranger = occupancies.find((item) => item.plateNoSnapshot === 'STR-0001');
  assert(stranger, 'occupancy created');
  const stillAssigned = (await listParkingAssignmentsForActor(admin, space01.id)).filter((item) => item.isCurrent);
  assert(stillAssigned.some((item) => item.unitId === unitA.id), 'assignment unchanged by occupancy');
  const violations = await listParkingViolationsForActor(admin, siteA.id);
  assert(
    violations.some((item) => item.violationType === 'unauthorized_space' && item.plateNoSnapshot === 'STR-0001'),
    'stranger on private space creates violation',
  );

  const occupyVisitor = await occupyParkingSpaceForActor(admin, {
    parkingSpaceId: visitorSpace.id,
    plateNo: 'ABC-8888',
  });
  const later = new Date(new Date(occupyVisitor.occupancy.occupiedFrom).getTime() + 155 * 60 * 1000);
  const marked = await refreshParkingOverstaysForSite(admin, siteA.id, later);
  assert(marked.some((item) => item.id === occupyVisitor.occupancy.id && item.status === 'overstayed'), 'visitor overstay marked');
  const overstayNotes = await listNotifications(seeded.tenant.id, admin.userId!);
  assert(
    overstayNotes.some((item) => item.body.includes('ABC-8888') && item.body.includes('已臨停')),
    'overstay notification',
  );
  assert(
    (await listParkingViolationsForActor(admin, siteA.id)).some((item) => item.violationType === 'visitor_overstay'),
    'overstay violation without fine',
  );

  const key = await createManagedKeyForActor(admin, {
    siteId: siteA.id,
    keyCode: 'KEY-ROOF',
    name: '頂樓鑰匙',
    storageLocation: '櫃台',
  });
  assert(key.qrAssetId, 'key qr issued');
  if (key.qrAssetId) {
    const qr = await getQrAssetById(key.qrAssetId, seeded.tenant.id);
    assert(qr?.assetType === 'key_item' && qr.targetType === 'managed_key', 'qr uses phase 2b-1 key_item');
  }
  const duePast = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const checkedOut = await checkoutKeyForActor(staffActor, {
    keyId: key.id,
    borrowerType: 'staff',
    borrowerName: '李值班',
    dueAt: duePast,
    purpose: '巡樓',
  });
  await expectFailure(
    () => checkoutKeyForActor(staffActor, { keyId: key.id, borrowerType: 'staff', borrowerName: '另一人' }),
    '目前已借出',
    'checked out key cannot checkout again',
  );
  const returned = await returnKeyForActor(staffActor, { keyId: key.id });
  assert(returned.key.status === 'available', 'key available after return');
  const keyDetail = await getManagedKeyForActor(admin, key.id);
  assert(keyDetail.transactions.some((item) => item.id === checkedOut.transaction.id), 'original checkout kept');
  assert(keyDetail.transactions.some((item) => item.transactionType === 'return'), 'return appended');
  await expectFailure(
    () => getDatabase().run('UPDATE key_transactions SET note = ? WHERE id = ?', ['tamper', checkedOut.transaction.id]),
    '不可修改或刪除',
    'key tx cannot update',
  );
  await expectFailure(
    () => getDatabase().run('DELETE FROM key_transactions WHERE id = ?', [checkedOut.transaction.id]),
    '不可修改或刪除',
    'key tx cannot delete',
  );
  await checkoutKeyForActor(staffActor, {
    keyId: key.id,
    borrowerType: 'staff',
    borrowerName: '李值班',
    dueAt: duePast,
  });
  const overdueKeys = await listOverdueKeysForActor(admin, siteA.id);
  assert(overdueKeys.some((item) => item.key.id === key.id), 'key overdue listed');
  await notifyOverdueKeysForSite(admin, siteA.id);
  const lost = await reportKeyIssueForActor(admin, { keyId: key.id, type: 'lost', note: '遺失於機房' });
  assert(lost.transaction.compensationReviewRequired, 'lost requires compensation review');
  assert(lost.key.status === 'lost', 'key marked lost');

  const item = await createLoanItemForActor(admin, {
    siteId: siteA.id,
    itemCode: 'CART-01',
    name: '推車',
    totalQuantity: 5,
    storageLocation: 'B1倉庫',
  });
  assert(item.availableQuantity === 5, 'initial available equals total');
  const borrow = await borrowLoanItemForActor(staffActor, {
    itemId: item.id,
    quantity: 3,
    borrowerType: 'staff',
    borrowerName: '李值班',
    dueAt: duePast,
  });
  assert(borrow.item.availableQuantity === 2, 'quantity decreased');
  await expectFailure(
    () =>
      borrowLoanItemForActor(staffActor, {
        itemId: item.id,
        quantity: 3,
        borrowerType: 'staff',
        borrowerName: '李值班',
      }),
    '目前可借 2 件',
    'cannot over-borrow',
  );
  const partial = await returnLoanItemForActor(staffActor, {
    itemId: item.id,
    borrowTransactionId: borrow.transaction.id,
    quantity: 1,
  });
  assert(partial.item.availableQuantity === 3, 'partial return');
  const full = await returnLoanItemForActor(staffActor, {
    itemId: item.id,
    borrowTransactionId: borrow.transaction.id,
    quantity: 2,
  });
  assert(full.item.availableQuantity === 5, 'full return');
  await expectFailure(
    () => getDatabase().run('UPDATE item_loan_transactions SET note = ? WHERE id = ?', ['tamper', borrow.transaction.id]),
    '不可修改或刪除',
    'item tx cannot update',
  );
  await expectFailure(
    () => getDatabase().run('DELETE FROM item_loan_transactions WHERE id = ?', [borrow.transaction.id]),
    '不可修改或刪除',
    'item tx cannot delete',
  );
  await borrowLoanItemForActor(staffActor, {
    itemId: item.id,
    quantity: 1,
    borrowerType: 'staff',
    borrowerName: '李值班',
    dueAt: duePast,
  });
  const overdueItems = await listOverdueItemLoansForActor(admin, siteA.id);
  assert(overdueItems.some((row) => row.item.id === item.id), 'item overdue listed');
  const damaged = await reportLoanItemIssueForActor(admin, {
    itemId: item.id,
    type: 'damaged',
    quantity: 1,
    note: '輪子損壞',
  });
  assert(damaged.transaction.compensationReviewRequired, 'item damage review required');

  const other = await seed('他司車', 'other.p3b.admin');
  const otherAdmin = asActor(other.user);
  await expectFailure(() => getParkingSpaceForActor(otherAdmin, space01.id), '其他公司', 'cross tenant rejected');
  await expectFailure(
    () => createParkingSpaceForActor(staffActor, { siteId: siteB.id, spaceNo: 'X1', spaceType: 'private' }),
    '案場',
    'site scope rejected',
  );

  const logs = await listAuditLogs(seeded.tenant.id);
  const createLog = logs.find((item) => item.description.includes('建立車位'));
  assert(createLog, 'create space audit');
  assert(createLog.actorNameSnapshot === admin.fullName, 'audit real name');
  assert(formatDateTimeZh(createLog.createdAt).includes('年'), 'audit zh time');
  assert(logs.some((item) => item.description.includes('辦理車輛') && item.description.includes('進場')), 'check-in audit');
  assert(logs.some((item) => item.description.includes('借出鑰匙')), 'key checkout audit');
  assert(logs.some((item) => item.description.includes('尚餘 2 件')), 'partial return audit');

  const home = await getDashboardSnapshot(admin, { siteId: siteA.id });
  assert(home.mobilityCard, 'home mobility live');
  assert(home.mobilityCard!.vehiclesOnSite >= 1, 'home on-site vehicles');
  assert(home.mobilityCard!.openViolations >= 1, 'home violations');

  const filename = db.filename;
  db.close();
  const reopened = createBetterSqliteDatabase(filename);
  setDatabase(reopened);
  await migrate(reopened);
  assert((await getSchemaVersion(reopened)) === CURRENT_SCHEMA_VERSION, 'reopen version');
  const stillSpace = await getParkingSpaceForActor(admin, space01.id);
  assert(stillSpace.displayName.includes('01'), 'sqlite reopen keeps parking');
  const stillKey = await getManagedKeyForActor(admin, key.id);
  assert(stillKey.transactions.length >= 2, 'key history persisted');
  reopened.close();

  const upgradeDb = createBetterSqliteDatabase(path.join(os.tmpdir(), `qinguan-p3b-up-${createId()}.db`));
  setDatabase(upgradeDb);
  configureKvStore(new MemoryKvStore());
  await applyThrough009(upgradeDb);
  assert((await getSchemaVersion(upgradeDb)) === 9, 'pre-upgrade schema 9');
  const kept = await seed('升級三B', 'up3b.admin');
  const upAdmin = asActor(kept.user);
  const siteRow = await upgradeDb.getFirst<{ id: string }>(`SELECT id FROM sites WHERE tenant_id = ?`, [kept.tenant.id]);
  assert(siteRow, 'upgrade site');
  const point = await createPatrolPoint(upAdmin, { siteId: siteRow.id, name: '大門', code: 'GATE-UP' });
  const qr = await issuePatrolPointQr(upAdmin, point.id);
  const shift = await createShiftTemplate(upAdmin, { name: '日班', code: 'DAY-UP3B', startTime: '08:00', endTime: '20:00' });
  const guard = await createUser(upAdmin, kept.tenant, {
    fullName: '升級人員',
    account: 'up.p3b.guard',
    siteId: siteRow.id,
    roleKey: 'STAFF',
  });
  const schedule = await createSchedule(upAdmin, {
    userId: guard.id,
    siteId: siteRow.id,
    workDate: '2026-09-09',
    shiftTemplateId: shift.id,
  });
  const unit = await createSiteUnit(upAdmin, { siteId: siteRow.id, building: 'A棟', floor: '1', unitNo: '1' });
  const resident = await createResidentWithOccupancy(upAdmin, {
    unitId: unit.id,
    fullName: '保留住戶',
    relationKey: 'owner',
  });
  const visitorKeep = await registerVisitorPass(upAdmin, {
    siteId: siteRow.id,
    unitId: unit.id,
    visitorKind: 'guest',
    visitorName: '保留訪客',
  });
  const inspCount = await upgradeDb.getFirst<{ c: number }>('SELECT COUNT(*) as c FROM inspection_criteria WHERE tenant_id = ?', [
    kept.tenant.id,
  ]);
  const upgraded = await migrate(upgradeDb);
  assert(upgraded === CURRENT_SCHEMA_VERSION, `upgrade 009→010 got ${upgraded}`);
  const keepPoint = await upgradeDb.getFirst<{ name: string }>('SELECT name FROM patrol_points WHERE id = ?', [point.id]);
  assert(keepPoint?.name === '大門', 'patrol kept after 009→010');
  const keepQr = await upgradeDb.getFirst<{ qr_code: string }>('SELECT qr_code FROM qr_assets WHERE id = ?', [qr.id]);
  assert(keepQr?.qr_code === qr.qrCode, 'qr kept after rebuild');
  const keepSchedule = await upgradeDb.getFirst<{ id: string }>('SELECT id FROM work_schedules WHERE id = ?', [schedule.id]);
  assert(keepSchedule, 'schedule kept');
  const keepResident = await upgradeDb.getFirst<{ full_name: string }>('SELECT full_name FROM residents WHERE id = ?', [
    resident.resident.id,
  ]);
  assert(keepResident?.full_name === '保留住戶', 'phase 3a resident kept');
  const keepVisitor = await upgradeDb.getFirst<{ visitor_name: string }>('SELECT visitor_name FROM visitor_passes WHERE id = ?', [
    visitorKeep.id,
  ]);
  assert(keepVisitor?.visitor_name === '保留訪客', 'visitor kept');
  const keepInsp = await upgradeDb.getFirst<{ c: number }>('SELECT COUNT(*) as c FROM inspection_criteria WHERE tenant_id = ?', [
    kept.tenant.id,
  ]);
  assert((keepInsp?.c ?? 0) === (inspCount?.c ?? 0), 'inspection kept');
  const parkingTable = await upgradeDb.getFirst<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='parking_spaces'`,
  );
  assert(parkingTable, '010 tables created');
  upgradeDb.close();

  console.log('phase3b tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
