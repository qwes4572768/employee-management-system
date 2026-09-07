import os from 'node:os';
import path from 'node:path';

import { CURRENT_SCHEMA_VERSION, MIGRATION_001_SQL } from '@/database/migrations';
import { migration002 } from '@/database/migrations/002_integrity_constraints';
import { migration003 } from '@/database/migrations/003_workforce_attendance';
import { migration004 } from '@/database/migrations/004_site_shift_requirements';
import { migration005 } from '@/database/migrations/005_qr_asset_center';
import { migration006 } from '@/database/migrations/006_smart_patrol';
import { migration007 } from '@/database/migrations/007_inspection_evaluation';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { getSchemaVersion, isForeignKeysEnabled, migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { listAuditLogs } from '@/repositories/auditRepository';
import { listParcelEvents } from '@/repositories/parcelRepository';
import { listResidentOccupancies } from '@/repositories/residentRepository';
import { listRoles } from '@/repositories/roleRepository';
import { findAccountGlobally } from '@/repositories/userRepository';
import { listVisitorMovements } from '@/repositories/visitorRepository';
import type { ActorContext } from '@/services/actor';
import type { Tenant } from '@/types';
import { registerAccount, reviewAccount } from '@/services/authService';
import { bootstrapSystem } from '@/services/bootstrapService';
import { getCommunityHomeCard } from '@/services/communityDashboardService';
import { getDashboardSnapshot } from '@/services/dashboardService';
import { pickupParcel, registerParcel } from '@/services/parcelService';
import {
  addResidentOccupancyForActor,
  createResidentWithOccupancy,
} from '@/services/residentService';
import { assignRoleToUser } from '@/services/roleService';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { assignUserToSite, createSite } from '@/services/siteService';
import { createSiteUnit, getSiteUnitForActor, listSiteUnitsForActor } from '@/services/unitService';
import {
  checkInVisitor,
  checkOutVisitor,
  registerVisitorPass,
} from '@/services/visitorService';
import { formatDateTimeZh } from '@/utils/datetime';
import { createId } from '@/utils/id';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function systemActor(suffix = 'p3a'): ActorContext {
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

async function seed(name: string, account: string, siteName = '中正名人巷') {
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
      name: siteName,
      address: '台北市',
    },
    actor: systemActor(account),
  });
}

async function openDb() {
  const filename = path.join(os.tmpdir(), `qinguan-p3a-${createId()}.db`);
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

async function applyThrough007(db: ReturnType<typeof createBetterSqliteDatabase>) {
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
  await db.exec('PRAGMA foreign_keys = ON;');
}

async function main() {
  const db = await openDb();
  const version = await migrate(db);
  assert(version === CURRENT_SCHEMA_VERSION, `fresh install expected ${CURRENT_SCHEMA_VERSION}, got ${version}`);
  assert(CURRENT_SCHEMA_VERSION === 8, 'schema version must be 8');
  assert(await isForeignKeysEnabled(db), 'FK must be on');
  const tables = await db.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'site_units','residents','resident_occupancies','visitor_passes','visitor_movements','parcels','parcel_events'
    )`,
  );
  assert(tables.length === 7, `community tables missing ${tables.length}`);

  const seeded = await seed('社區', 'p3a.admin');
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
    account: 'li.duty',
    siteId: siteA.id,
    roleKey: 'STAFF',
  });
  const staffActor = asActor(staffUser, siteA.id, '一般勤務人員');

  const unit = await createSiteUnit(admin, {
    siteId: siteA.id,
    building: 'A棟',
    floor: '12',
    unitNo: '3',
  });
  assert(unit.displayName.includes('A棟'), 'unit label');
  assert(unit.status === 'active', 'unit active');

  await expectFailure(
    () => createSiteUnit(staffActor, { siteId: siteA.id, unitNo: '99' }),
    '權限',
    'staff cannot manage units',
  );

  const other = await seed('他司', 'p3a.other');
  const otherAdmin = asActor(other.user);
  await expectFailure(
    () => createSiteUnit(otherAdmin, { siteId: siteA.id, unitNo: '1' }),
    '其他公司',
    'cross tenant create rejected',
  );
  await expectFailure(() => getSiteUnitForActor(otherAdmin, unit.id), '其他公司', 'cross tenant read rejected');
  await expectFailure(
    () => listSiteUnitsForActor(staffActor, siteB.id),
    '案場',
    'unauthorized site rejected',
  );

  const owner = await createResidentWithOccupancy(admin, {
    unitId: unit.id,
    fullName: '周家明',
    phone: '0912000111',
    relationKey: 'owner',
    isPrimary: true,
  });
  assert(owner.occupancy.relationKey === 'owner', 'owner relation');
  const tenantResident = await createResidentWithOccupancy(admin, {
    unitId: unit.id,
    fullName: '林承租',
    phone: '0912000222',
    relationKey: 'tenant',
  });
  assert(tenantResident.occupancy.relationKey === 'tenant', 'tenant relation');
  const occupancies = await listResidentOccupancies(seeded.tenant.id, { unitId: unit.id, currentOnly: true });
  assert(
    occupancies.some((item) => item.relationKey === 'owner') && occupancies.some((item) => item.relationKey === 'tenant'),
    'owner and tenant coexist',
  );
  await addResidentOccupancyForActor(admin, {
    residentId: owner.resident.id,
    unitId: unit.id,
    relationKey: 'family',
  });

  const guest = await registerVisitorPass(staffActor, {
    siteId: siteA.id,
    unitId: unit.id,
    hostResidentId: owner.resident.id,
    visitorKind: 'guest',
    visitorName: '張來訪',
    purpose: '探訪',
  });
  assert(guest.status === 'registered', 'guest registered');
  await expectFailure(() => checkOutVisitor(staffActor, guest.id), '尚未進場', 'cannot leave before enter');
  const checkedIn = await checkInVisitor(staffActor, guest.id, { photoUri: 'file:///tmp/visitor-in.jpg' });
  assert(checkedIn.pass.status === 'checked_in', 'checked in');
  await expectFailure(() => checkInVisitor(staffActor, guest.id), '已在場', 'cannot enter twice');
  const checkedOut = await checkOutVisitor(staffActor, guest.id, { photoUri: 'file:///tmp/visitor-out.jpg' });
  assert(checkedOut.pass.status === 'checked_out', 'checked out');
  const movements = await listVisitorMovements(seeded.tenant.id, guest.id);
  assert(movements.length === 2, 'append-only movements');
  assert(movements[0]?.direction === 'in' && movements[1]?.direction === 'out', 'in then out');

  for (const kind of ['vendor', 'delivery', 'temporary'] as const) {
    const pass = await registerVisitorPass(staffActor, {
      siteId: siteA.id,
      unitId: unit.id,
      visitorKind: kind,
      visitorName: `${kind}人員`,
      visitorCompany: kind === 'delivery' ? '外送平台' : '協力廠商',
    });
    assert(pass.visitorKind === kind, `${kind} registered`);
  }

  const parcel = await registerParcel(staffActor, {
    unitId: unit.id,
    residentId: owner.resident.id,
    parcelKind: 'general',
    locationNote: '櫃檯第三層',
    trackingNo: 'TW123456',
  });
  assert(parcel.status === 'registered', 'parcel registered');
  await expectFailure(
    () => pickupParcel(staffActor, parcel.id, { pickupByName: '', pickupPhotoUri: 'file:///tmp/parcel-pickup.jpg' }),
    '領取人姓名',
    'pickup requires name',
  );
  await expectFailure(
    () => pickupParcel(staffActor, parcel.id, { pickupByName: '周家明', pickupPhotoUri: '' }),
    '簽收照片',
    'pickup requires photo',
  );
  const picked = await pickupParcel(staffActor, parcel.id, {
    pickupByName: '周家明',
    pickupPhotoUri: 'file:///tmp/parcel-pickup.jpg',
    pickupSignatureNote: '本人領取',
  });
  assert(picked.status === 'picked_up', 'picked up');
  assert(picked.pickupByName === '周家明', 'pickup name stored');
  assert(picked.pickupPhotoUri === 'file:///tmp/parcel-pickup.jpg', 'pickup photo stored');
  assert(picked.pickupAt, 'pickup time stored');
  await expectFailure(
    () =>
      pickupParcel(staffActor, parcel.id, {
        pickupByName: '周家明',
        pickupPhotoUri: 'file:///tmp/parcel-pickup.jpg',
      }),
    '重複領取',
    'cannot pickup twice',
  );
  const events = await listParcelEvents(seeded.tenant.id, parcel.id);
  assert(events.some((item) => item.action === 'register') && events.some((item) => item.action === 'pickup'), 'parcel events kept');

  const waiting = await registerParcel(staffActor, {
    unitId: unit.id,
    recipientName: '林承租',
    parcelKind: 'refrigerated',
    locationNote: '冷凍櫃',
  });
  assert(waiting.status === 'registered', 'second parcel waiting');

  const logs = await listAuditLogs(seeded.tenant.id);
  const communityLogs = logs.filter((item) => ['unit', 'resident', 'visitor', 'parcel'].includes(item.module));
  assert(communityLogs.length >= 8, `audit count ${communityLogs.length}`);
  assert(
    communityLogs.every((item) => item.actorNameSnapshot && formatDateTimeZh(item.createdAt).includes('年')),
    'audit real name and time',
  );
  assert(
    communityLogs.some((item) => item.description.includes(admin.fullName) && item.description.includes('戶別')),
    'unit audit uses admin name',
  );
  assert(
    communityLogs.some((item) => item.description.includes('李值班') && item.description.includes('張來訪')),
    'visitor audit uses staff name',
  );

  const home = await getCommunityHomeCard(admin, siteA.id);
  assert(home.parcelsWaiting >= 1, 'waiting parcels');
  const snap = await getDashboardSnapshot(admin, { siteId: siteA.id });
  assert(snap.communityCard, 'home community card live');
  assert(snap.communityCard?.parcelsWaiting === home.parcelsWaiting, 'home not placeholder');

  const filename = db.filename;
  db.close();
  const reopened = createBetterSqliteDatabase(filename);
  setDatabase(reopened);
  const stillUnit = await getSiteUnitForActor(admin, unit.id);
  assert(stillUnit.displayName === unit.displayName, 'sqlite reopen keeps unit');
  const stillOcc = await listResidentOccupancies(seeded.tenant.id, { unitId: unit.id, currentOnly: true });
  assert(stillOcc.length >= 3, 'sqlite reopen keeps occupancies');
  const stillMoves = await listVisitorMovements(seeded.tenant.id, guest.id);
  assert(stillMoves.length === 2, 'sqlite reopen keeps visitor movements');
  const stillEvents = await listParcelEvents(seeded.tenant.id, parcel.id);
  assert(stillEvents.length >= 2, 'sqlite reopen keeps parcel events');
  reopened.close();

  const upgradeDb = createBetterSqliteDatabase(path.join(os.tmpdir(), `qinguan-p3a-up-${createId()}.db`));
  setDatabase(upgradeDb);
  configureKvStore(new MemoryKvStore());
  await applyThrough007(upgradeDb);
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
    `INSERT INTO qr_assets (id, tenant_id, site_id, asset_type, target_type, target_id, display_name, qr_code, status, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('q-keep', 't-keep', 's-keep', 'employee', 'employee', 'missing', '保留QR', 'QINGUAN:v1:keep3a', 'active', NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts],
  );
  await upgradeDb.run(
    `INSERT INTO patrol_points (id, tenant_id, site_id, name, code, require_qr, require_gps, require_photo, status, sort_order, created_by, created_at, updated_at, deleted_at, version, sync_status, device_id)
     VALUES ('pp-keep', 't-keep', 's-keep', '保留點', 'KEEP-P', 0, 0, 0, 'active', 1, NULL, ?, ?, NULL, 1, 'local', NULL)`,
    [ts, ts],
  );
  await upgradeDb.exec('PRAGMA foreign_keys = ON;');
  const beforeVersion = await getSchemaVersion(upgradeDb);
  assert(beforeVersion === 7, `pre-upgrade version ${beforeVersion}`);
  const upgraded = await migrate(upgradeDb);
  assert(upgraded === 8, `upgrade 007→008 got ${upgraded}`);
  const keepQr = await upgradeDb.getFirst<{ qr_code: string }>('SELECT qr_code FROM qr_assets WHERE id = ?', ['q-keep']);
  assert(keepQr?.qr_code === 'QINGUAN:v1:keep3a', 'qr kept after 007→008');
  const keepPoint = await upgradeDb.getFirst<{ name: string }>('SELECT name FROM patrol_points WHERE id = ?', ['pp-keep']);
  assert(keepPoint?.name === '保留點', 'patrol kept');
  const keepSite = await upgradeDb.getFirst<{ name: string }>('SELECT name FROM sites WHERE id = ?', ['s-keep']);
  assert(keepSite?.name === '保留案場', 'phase2a site kept');
  const keptTables = await upgradeDb.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'work_schedules','inspection_sessions','qr_assets','patrol_points','site_units','parcels','visitor_passes'
    )`,
  );
  assert(keptTables.length === 7, `upgrade kept prior tables ${keptTables.map((item) => item.name).join(',')}`);
  upgradeDb.close();

  console.log('phase3a tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
