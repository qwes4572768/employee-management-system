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
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { getDatabase, setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { getParcelById, listParcelEvents } from '@/repositories/parcelRepository';
import { getResidentById, listResidentOccupancies, listResidents } from '@/repositories/residentRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import { listVisitorMovements } from '@/repositories/visitorRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { reverseParcelEvent, pickupParcel, registerParcel } from '@/services/parcelService';
import {
  addResidentOccupancyForActor,
  createResidentWithOccupancy,
  endResidentOccupancyForActor,
  getResidentForActor,
  listResidentsForActor,
} from '@/services/residentService';
import { assignRoleToUser } from '@/services/roleService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { assignUserToSite, createSite } from '@/services/siteService';
import { createSiteUnit } from '@/services/unitService';
import {
  checkInVisitor,
  correctVisitorMovement,
  registerVisitorPass,
  voidVisitorMovement,
} from '@/services/visitorService';
import { formatDateTimeZh } from '@/utils/datetime';
import { createId } from '@/utils/id';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p3a1'): ActorContext {
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
  const filename = path.join(os.tmpdir(), `qinguan-p3a1-${createId()}.db`);
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

async function applyThrough008(db: ReturnType<typeof createBetterSqliteDatabase>) {
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
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(CURRENT_SCHEMA_VERSION === 10, 'schema version must be 10');
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const residentCols = await db.getAll<{ name: string }>('PRAGMA table_info(residents)');
  assert(!residentCols.some((item) => item.name === 'unit_id'), 'residents.unit_id must be removed');
  assert(residentCols.some((item) => item.name === 'full_name'), 'resident master kept');

  const seeded = await seed('主檔', 'p3a1.admin');
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
    account: 'li.p3a1',
    siteId: siteA.id,
    roleKey: 'STAFF',
  });
  const staffActor = asActor(staffUser, siteA.id, '一般勤務人員');

  const unit5 = await createSiteUnit(admin, { siteId: siteA.id, building: 'A棟', floor: '5', unitNo: '1' });
  const unit8 = await createSiteUnit(admin, { siteId: siteA.id, building: 'A棟', floor: '8', unitNo: '2' });
  const unit10 = await createSiteUnit(admin, { siteId: siteA.id, building: 'A棟', floor: '10', unitNo: '3' });

  const created = await createResidentWithOccupancy(admin, {
    unitId: unit5.id,
    fullName: '王先生',
    relationKey: 'owner',
    isPrimary: true,
  });
  const second = await addResidentOccupancyForActor(admin, {
    residentId: created.resident.id,
    unitId: unit8.id,
    relationKey: 'owner',
    reason: '同人第二戶',
  });
  assert(second.residentId === created.resident.id, 'same resident master');
  const people = (await listResidents(seeded.tenant.id, { siteId: siteA.id })).filter((item) => item.fullName === '王先生');
  assert(people.length === 1, 'adding second unit must not duplicate resident');
  const currentBoth = await listResidentOccupancies(seeded.tenant.id, { residentId: created.resident.id, currentOnly: true });
  assert(currentBoth.length === 2, 'one person two current owner units');
  await addResidentOccupancyForActor(admin, {
    residentId: created.resident.id,
    unitId: unit10.id,
    relationKey: 'agent',
  });

  await endResidentOccupancyForActor(admin, created.occupancy.id, { reason: '5F-1 租約／持有結束' });
  const afterEnd = await getResidentForActor(admin, created.resident.id);
  assert(afterEnd.resident.status === 'active', 'ending one unit does not move out resident');
  assert(afterEnd.current.some((item) => item.unitId === unit8.id), 'second unit still current');
  assert(afterEnd.history.some((item) => item.unitId === unit5.id), 'first unit kept as history');

  for (const row of afterEnd.current) {
    await endResidentOccupancyForActor(admin, row.id, { reason: '全部結束' });
  }
  const moved = await getResidentById(created.resident.id, seeded.tenant.id);
  assert(moved?.status === 'moved_out', 'all current occupancies ended → moved_out');
  assert(moved?.id === created.resident.id, 'resident master not deleted');

  const revived = await addResidentOccupancyForActor(admin, {
    residentId: created.resident.id,
    unitId: unit8.id,
    relationKey: 'owner',
    reason: '重新啟用 8F-2',
  });
  const revivedResident = await getResidentById(created.resident.id, seeded.tenant.id);
  assert(revived.residentId === created.resident.id, 'reactivate uses same master');
  assert(revivedResident?.status === 'active', 'new occupancy restores active');

  const otherUnit = await createSiteUnit(admin, { siteId: siteA.id, building: 'B棟', floor: '1', unitNo: '1' });
  await expectFailure(
    () =>
      registerVisitorPass(staffActor, {
        siteId: siteA.id,
        unitId: otherUnit.id,
        hostResidentId: created.resident.id,
        visitorKind: 'guest',
        visitorName: '錯掛訪客',
      }),
    '有效關係',
    'host must have current occupancy on visitor unit',
  );
  const guest = await registerVisitorPass(staffActor, {
    siteId: siteA.id,
    unitId: unit8.id,
    hostResidentId: created.resident.id,
    visitorKind: 'guest',
    visitorName: '張來訪',
  });
  assert(guest.hostResidentId === created.resident.id, 'valid host accepted');

  await expectFailure(
    () =>
      registerParcel(staffActor, {
        unitId: otherUnit.id,
        residentId: created.resident.id,
        recipientName: '王先生',
      }),
    '有效關係',
    'parcel resident must occupy parcel unit',
  );
  const named = await registerParcel(staffActor, {
    unitId: otherUnit.id,
    recipientName: '臨時收件人',
  });
  assert(named.residentId === null, 'snapshot-only parcel allowed');
  assert(named.recipientNameSnapshot === '臨時收件人', 'recipient snapshot kept');

  const checked = await checkInVisitor(staffActor, guest.id);
  const originalOccurred = checked.movement.occurredAt;
  await expectFailure(
    () => getDatabase().run('UPDATE visitor_movements SET occurred_at = ? WHERE id = ?', ['2099-01-01T00:00:00.000Z', checked.movement.id]),
    '不可修改或刪除',
    'visitor_movements cannot update',
  );
  await expectFailure(
    () => getDatabase().run('DELETE FROM visitor_movements WHERE id = ?', [checked.movement.id]),
    '不可修改或刪除',
    'visitor_movements cannot delete',
  );
  const corrected = await correctVisitorMovement(admin, checked.movement.id, {
    occurredAt: '2026-09-07T10:30:00.000Z',
    reason: '登記時間打錯',
  });
  const movements = await listVisitorMovements(seeded.tenant.id, guest.id);
  const original = movements.find((item) => item.id === checked.movement.id);
  assert(original?.occurredAt === originalOccurred, 'original movement time kept');
  assert(corrected.movement.eventKind === 'correction', 'correction appended');
  assert(movements.some((item) => item.eventKind === 'movement') && movements.some((item) => item.eventKind === 'correction'), 'history has both');
  await voidVisitorMovement(admin, checked.movement.id, '誤登記進場');
  const afterVoid = await listVisitorMovements(seeded.tenant.id, guest.id);
  assert(afterVoid.some((item) => item.eventKind === 'void'), 'void appended');
  assert(afterVoid.some((item) => item.id === checked.movement.id), 'void keeps original row');

  const parcel = await registerParcel(staffActor, {
    unitId: unit8.id,
    residentId: created.resident.id,
  });
  const picked = await pickupParcel(staffActor, parcel.id, {
    pickupByName: '王先生',
    pickupPhotoUri: 'file:///tmp/parcel-pickup.jpg',
  });
  const pickupEvent = (await listParcelEvents(seeded.tenant.id, parcel.id)).find((item) => item.action === 'pickup');
  assert(pickupEvent, 'pickup event exists');
  await expectFailure(
    () => getDatabase().run('UPDATE parcel_events SET action = ? WHERE id = ?', ['tamper', pickupEvent!.id]),
    '不可修改或刪除',
    'parcel_events cannot update',
  );
  await expectFailure(
    () => getDatabase().run('DELETE FROM parcel_events WHERE id = ?', [pickupEvent!.id]),
    '不可修改或刪除',
    'parcel_events cannot delete',
  );
  const reversed = await reverseParcelEvent(admin, parcel.id, { reason: '誤按成已領取' });
  assert(reversed.status !== 'picked_up', 'current status corrected');
  const events = await listParcelEvents(seeded.tenant.id, parcel.id);
  assert(events.some((item) => item.action === 'pickup'), 'original pickup kept');
  assert(events.some((item) => item.action === 'reversal' && item.reason === '誤按成已領取'), 'reversal appended');
  const stillPickup = await getParcelById(parcel.id, seeded.tenant.id);
  assert(stillPickup, 'parcel row kept');

  const other = await seed('他司', 'p3a1.other');
  const otherAdmin = asActor(other.user);
  await expectFailure(() => getResidentForActor(otherAdmin, created.resident.id), '其他公司', 'cross tenant rejected');
  const managerUser = await createUser(admin, seeded.tenant, {
    fullName: '陳主管',
    account: 'chen.p3a1',
    siteId: siteA.id,
    roleKey: 'MANAGER',
  });
  const managerActor = asActor(managerUser, siteA.id, '主管');
  const siteBUnit = await createSiteUnit(admin, { siteId: siteB.id, unitNo: 'X1' });
  await expectFailure(
    () => listResidentsForActor(staffActor, { unitId: siteBUnit.id }),
    '案場',
    'site scope rejected for staff list',
  );
  await expectFailure(
    () =>
      addResidentOccupancyForActor(managerActor, {
        residentId: created.resident.id,
        unitId: siteBUnit.id,
        relationKey: 'owner',
      }),
    '案場',
    'site scope rejected',
  );

  const logs = await listAuditLogs(seeded.tenant.id);
  const relevant = logs.filter((item) => ['resident', 'visitor', 'parcel'].includes(item.module));
  assert(
    relevant.every((item) => item.actorNameSnapshot && formatDateTimeZh(item.createdAt).includes('年')),
    'audit real name and time',
  );
  assert(
    relevant.some((item) => item.description.includes(admin.fullName) && item.description.includes('原因') && item.description.includes('王先生')),
    'occupancy/correction audit includes actor, person, reason',
  );

  db.close();

  const upgradeDb = createBetterSqliteDatabase(path.join(os.tmpdir(), `qinguan-p3a1-up-${createId()}.db`));
  setDatabase(upgradeDb);
  configureKvStore(new MemoryKvStore());
  await applyThrough008(upgradeDb);
  const ts = new Date().toISOString();
  await upgradeDb.exec('PRAGMA foreign_keys = OFF;');
  await upgradeDb.run(
    `INSERT INTO tenants (id, official_name, short_name, tax_id, phone, address, logo_uri, industry_type, status, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('t-keep', '保留公司', '保留', NULL, NULL, NULL, NULL, NULL, 'active', NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO sites (id, tenant_id, site_code, name, address, latitude, longitude, attendance_radius, require_gps, require_site_qr, status, starts_at, expires_at, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('s-keep', 't-keep', 'KEEP', '保留案場', NULL, NULL, NULL, NULL, 0, 0, 'active', NULL, NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO site_units (id, tenant_id, site_id, building, floor, unit_no, display_name, occupancy_type, status, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('u-keep', 't-keep', 's-keep', 'A棟', '5', '1', 'A棟 5樓 1', 'owner_occupied', 'active', NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO residents (id, tenant_id, site_id, unit_id, full_name, phone, gender, id_last4, photo_uri, is_primary, move_in_at, move_out_at, status, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('r-keep', 't-keep', 's-keep', 'u-keep', '保留住戶', NULL, 'unspecified', NULL, NULL, 1, ?, NULL, 'active', NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO resident_occupancies (id, tenant_id, site_id, unit_id, resident_id, relation_key, relation_label_snapshot, starts_at, ends_at, is_current, notes, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('o-keep', 't-keep', 's-keep', 'u-keep', 'r-keep', 'owner', '所有人', ?, NULL, 1, NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO visitor_passes (id, tenant_id, site_id, unit_id, host_resident_id, visitor_kind, visitor_name, visitor_phone, visitor_company, id_last4, purpose, expected_at, expires_at, status, host_name_snapshot, unit_label_snapshot, checked_in_at, checked_out_at, time_source, device_time, server_time, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('v-keep', 't-keep', 's-keep', 'u-keep', 'r-keep', 'guest', '保留訪客', NULL, NULL, NULL, NULL, NULL, NULL, 'registered', '保留住戶', 'A棟 5樓 1', NULL, NULL, 'device', ?, NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO parcels (id, tenant_id, site_id, unit_id, resident_id, tracking_no, courier_name, parcel_kind, location_note, photo_uri, status, recipient_name_snapshot, unit_label_snapshot, registered_at, notified_at, pickup_at, pickup_by_name, pickup_photo_uri, pickup_signature_note, picked_up_by_staff_id, time_source, device_time, server_time, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('p-keep', 't-keep', 's-keep', 'u-keep', 'r-keep', 'KEEP-1', NULL, 'general', NULL, NULL, 'registered', '保留住戶', 'A棟 5樓 1', ?, NULL, NULL, NULL, NULL, NULL, NULL, 'device', ?, NULL, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts, ts, ts],
  );
  await upgradeDb.exec('PRAGMA foreign_keys = ON;');
  const before = await getSchemaVersion(upgradeDb);
  assert(before === 8, `pre-upgrade ${before}`);
  const upgraded = await migrate(upgradeDb);
  assert(upgraded === CURRENT_SCHEMA_VERSION, `upgrade 008→${CURRENT_SCHEMA_VERSION} got ${upgraded}`);
  const keepResident = await upgradeDb.getFirst<{ full_name: string }>('SELECT full_name FROM residents WHERE id = ?', ['r-keep']);
  assert(keepResident?.full_name === '保留住戶', 'resident kept');
  const colsAfter = await upgradeDb.getAll<{ name: string }>('PRAGMA table_info(residents)');
  assert(!colsAfter.some((item) => item.name === 'unit_id'), 'unit_id dropped after 009');
  const keepOcc = await upgradeDb.getFirst<{ relation_key: string }>('SELECT relation_key FROM resident_occupancies WHERE id = ?', ['o-keep']);
  assert(keepOcc?.relation_key === 'owner', 'occupancy kept');
  const keepVisitor = await upgradeDb.getFirst<{ visitor_name: string }>('SELECT visitor_name FROM visitor_passes WHERE id = ?', ['v-keep']);
  assert(keepVisitor?.visitor_name === '保留訪客', 'visitor kept');
  const keepParcel = await upgradeDb.getFirst<{ recipient_name_snapshot: string }>('SELECT recipient_name_snapshot FROM parcels WHERE id = ?', ['p-keep']);
  assert(keepParcel?.recipient_name_snapshot === '保留住戶', 'parcel kept');
  upgradeDb.close();

  console.log('phase3a1 tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
