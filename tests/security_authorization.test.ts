import assert from 'node:assert/strict';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { bootstrapSystem } from '@/services/bootstrapService';
import { registerAccount, reviewAccount, login, changeOwnProfile } from '@/services/authService';
import { systemActor, type ActorContext } from '@/services/actor';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { listRoles } from '@/repositories/roleRepository';
import { getUserById } from '@/repositories/userRepository';
import { listUserRoles, listRolePermissionKeys } from '@/repositories/permissionRepository';
import { getEffectivePermissionKeys } from '@/services/permissionService';
import { requireActorPermission, actorPermissionKeys } from '@/services/access';
import { assignRoleToUser, removeUserRoleAssignment, createCustomRole, updateRolePermissionSet, addUserPermissionOverride, setRoleStatus, listAssignableRoles } from '@/services/roleService';
import { createSite, assignUserToSite, editSite, getAuthorizedSites } from '@/services/siteService';
import { editTenant } from '@/services/tenantService';
import { setAccountStatus } from '@/services/userService';
import type { Role, User } from '@/types';

async function main() {
  const db = createBetterSqliteDatabase(':memory:');
  setDatabase(db);
  configureKvStore(new MemoryKvStore());
  await migrate(db);
  const sys = systemActor('authorization-test', '1.0.0');
  const password = 'TestOnly#Security26';
  const boot = await bootstrapSystem({
    admin: { fullName: '測試董事長', phone: '0900000000', employeeNo: 'QA-ADMIN', gender: 'male', hireDate: '2026-01-01', jobTitle: '董事長', account: 'qa.chairman', password, confirmPassword: password },
    company: { officialName: '測試保全公司', shortName: '測試', taxId: '12345678', phone: '0200000000', industryType: 'security' },
    site: { siteCode: 'QA', name: '測試案場', address: '測試' }, actor: sys,
  });
  const actorFor = (user: User): ActorContext => ({ ...sys, userId: user.id, tenantId: user.tenantId, fullName: user.fullName, account: user.account });
  const admin = actorFor(boot.user);
  const roles = await listRoles(boot.tenant.id);
  const staffRole = roles.find(r => r.roleKey === 'STAFF')!;
  const managerRole = roles.find(r => r.roleKey === 'MANAGER')!;
  const superRole = roles.find(r => r.roleKey === 'SUPER_ADMIN')!;
  const grant = (actor: ActorContext, user: User, role: Role, isPermanent = true) => assignRoleToUser(actor, {
    tenantId: boot.tenant.id, userId: user.id, roleId: role.id, startsAt: null, expiresAt: null, isPermanent, targetName: user.fullName, roleName: role.name,
  });
  async function makeUser(account: string, role: Role) {
    const pending = await registerAccount(boot.tenant, { fullName: account, phone: '0900000001', employeeNo: account.replaceAll('.', '-'), gender: 'male', hireDate: '2026-01-01', jobTitle: '測試', account, password, confirmPassword: password }, sys);
    const user = await reviewAccount(admin, pending.id, 'active', null);
    await grant(admin, user, role);
    return user;
  }
  const staff = await makeUser('qa.guard', staffRole);
  const managerUser = await makeUser('qa.manager', managerRole);
  const guard = actorFor(staff);
  const manager = actorFor(managerUser);
  const site = (await getAuthorizedSites(boot.user))[0]!;
  assert.notEqual(staff.id, boot.user.id);
  assert.equal((await login(staff.account, password, sys)).id, staff.id);
  await requireActorPermission(guard, 'attendance.clock');

  await assert.rejects(() => createSite(guard, { tenantId: boot.tenant.id, siteCode: 'ILLEGAL', name: '不應建立' }), /權限/);
  await assert.rejects(() => editSite(guard, site.id, { name: '不應修改' }), /權限/);
  await assert.rejects(() => assignUserToSite(guard, { tenantId: boot.tenant.id, userId: staff.id, siteId: site.id, startsAt: null, expiresAt: null, isPermanent: true, targetName: staff.fullName, siteName: site.name }), /權限/);
  await assert.rejects(() => editTenant(guard, boot.tenant.id, { officialName: '不應修改' }), /權限/);
  await assert.rejects(() => reviewAccount(guard, boot.user.id, 'returned', null), /權限/);
  await assert.rejects(() => setAccountStatus(guard, boot.user.id, 'suspended'), /權限/);
  await assert.rejects(() => grant(guard, staff, superRole), /權限/);
  await assert.rejects(() => createCustomRole(guard, { tenantId: boot.tenant.id, name: '非法角色' }), /權限/);
  await assert.rejects(() => grant(manager, managerUser, superRole), /權限/);
  await assert.rejects(() => setAccountStatus(manager, boot.user.id, 'suspended'), /高於/);
  await assert.rejects(() => editSite(manager, site.id, { name: '無授權案場' }), /案場的授權/);
  await assignUserToSite(admin, { tenantId: boot.tenant.id, userId: managerUser.id, siteId: site.id, startsAt: null, expiresAt: null, isPermanent: true, targetName: managerUser.fullName, siteName: site.name });
  await editSite(manager, site.id, { name: site.name });

  await setAccountStatus(admin, staff.id, 'suspended');
  assert.deepEqual(await getEffectivePermissionKeys(staff), [], 'stale User object must not retain permissions');
  assert.deepEqual(await getAuthorizedSites(staff), []);
  await assert.rejects(() => requireActorPermission(guard, 'attendance.clock'), /停權/);
  await assert.rejects(() => actorPermissionKeys(guard), /停權/);
  await assert.rejects(() => changeOwnProfile(guard, staff.id, { fullName: '停權修改' }), /停權/);
  await assert.rejects(() => login(staff.account, password, sys), /停權/);
  await setAccountStatus(admin, staff.id, 'active');
  await requireActorPermission(guard, 'attendance.clock');

  const statusOperator = await createCustomRole(admin, { tenantId: boot.tenant.id, name: '僅可停復權' });
  await updateRolePermissionSet(admin, boot.tenant.id, statusOperator.id, ['users.update']);
  await grant(admin, staff, statusOperator);
  const applicant = await registerAccount(boot.tenant, {
    fullName: '待審員工', phone: '0900000002', employeeNo: 'QA-PENDING', gender: 'male',
    hireDate: '2026-01-01', jobTitle: '保全', account: 'qa.pending', password, confirmPassword: password,
  }, sys);
  for (const status of ['pending', 'returned', 'rejected'] as const) {
    if (status !== 'pending') await reviewAccount(admin, applicant.id, status, '測試');
    await assert.rejects(() => setAccountStatus(guard, applicant.id, 'active'), /帳號審核流程/);
    await assert.rejects(() => setAccountStatus(guard, applicant.id, 'suspended'), /帳號審核流程/);
    assert.equal((await getUserById(applicant.id, boot.tenant.id))?.status, status);
  }
  await reviewAccount(admin, applicant.id, 'active', null);
  await setAccountStatus(guard, applicant.id, 'suspended');
  await setAccountStatus(guard, applicant.id, 'active');

  // A delegated role administrator may only grant rights already held.
  for (const permKey of ['users.assignRole', 'permissions.update', 'roles.create', 'roles.update']) {
    await addUserPermissionOverride(admin, { tenantId: boot.tenant.id, userId: managerUser.id, permKey, effect: 'allow', startsAt: null, expiresAt: null, isPermanent: true, targetName: managerUser.fullName });
  }
  await assert.rejects(() => grant(manager, managerUser, superRole), /高於/);
  const limited = await createCustomRole(manager, { tenantId: boot.tenant.id, name: '受限角色' });
  await updateRolePermissionSet(manager, boot.tenant.id, limited.id, ['attendance.clock']);
  await grant(manager, staff, limited);
  assert((await listAssignableRoles(manager)).some(role => role.id === limited.id));
  assert(!(await listAssignableRoles(manager)).some(role => role.id === superRole.id));
  await assert.rejects(() => updateRolePermissionSet(manager, boot.tenant.id, limited.id, ['roles.delete']), /超過/);
  assert.deepEqual(await listRolePermissionKeys(limited.id, boot.tenant.id), ['attendance.clock']);
  await assert.rejects(() => addUserPermissionOverride(manager, { tenantId: boot.tenant.id, userId: managerUser.id, permKey: 'roles.delete', effect: 'allow', startsAt: null, expiresAt: null, isPermanent: true, targetName: managerUser.fullName }), /超過/);
  await assert.rejects(() => setRoleStatus(manager, superRole.id, 'inactive'), /高於/);

  const adminAssignment = (await listUserRoles(boot.user.id, boot.tenant.id)).find(r => r.roleId === superRole.id)!;
  await assert.rejects(() => removeUserRoleAssignment(admin, adminAssignment.id, boot.user.fullName), /永久企業總管理員/);
  await assert.rejects(() => setAccountStatus(admin, boot.user.id, 'suspended'), /永久企業總管理員/);
  await assert.rejects(() => reviewAccount(admin, boot.user.id, 'returned', null), /永久企業總管理員/);
  await assert.rejects(() => grant(admin, boot.user, superRole, false), /永久企業總管理員/);
  assert.equal((await getUserById(boot.user.id, boot.tenant.id))?.status, 'active');
  assert.equal((await listUserRoles(boot.user.id, boot.tenant.id)).find(r => r.id === adminAssignment.id)?.isPermanent, true, 'failed mutation must roll back');
  await requireActorPermission(admin, 'users.assignRole');
  const futureAdmin = (user: User) => assignRoleToUser(admin, {
    tenantId: boot.tenant.id, userId: user.id, roleId: superRole.id,
    startsAt: '2099-01-01T00:00:00.000Z', expiresAt: null, isPermanent: true,
    targetName: user.fullName, roleName: superRole.name,
  });
  await assert.rejects(() => futureAdmin(boot.user), /永久企業總管理員/);
  assert.equal((await listUserRoles(boot.user.id, boot.tenant.id)).find(r => r.id === adminAssignment.id)?.startsAt, null);
  await futureAdmin(managerUser);
  await assert.rejects(() => removeUserRoleAssignment(admin, adminAssignment.id, boot.user.fullName), /永久企業總管理員/);
  await assert.rejects(() => setAccountStatus(admin, boot.user.id, 'suspended'), /永久企業總管理員/);
  await assert.rejects(() => futureAdmin(boot.user), /永久企業總管理員/);
  await grant(admin, managerUser, superRole, false);
  await assert.rejects(() => removeUserRoleAssignment(admin, adminAssignment.id, boot.user.fullName), /永久企業總管理員/);
  // A real handover to a second permanent administrator remains possible.
  await grant(admin, managerUser, superRole);
  await removeUserRoleAssignment(admin, adminAssignment.id, boot.user.fullName);
  await assert.rejects(() => requireActorPermission(admin, 'users.assignRole'), /權限/);
  await requireActorPermission(manager, 'users.assignRole');
  db.close();
  console.log('SECURITY_AUTHORIZATION_PASSED');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

