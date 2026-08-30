import { getDatabase } from '@/database/runtime';
import type { StaffingMode } from '@/constants/staffing';
import { STAFFING_MODES } from '@/constants/staffing';
import type { Gender, User, UserStatus } from '@/types';
import { nowIso } from '@/utils/datetime';
import { createId } from '@/utils/id';
import type { PasswordRecord } from '@/utils/password';

import { mapSync, type SyncRow } from './mappers';

async function usersHaveStaffingModeColumn(): Promise<boolean> {
  const cols = await getDatabase().getAll<{ name: string }>('PRAGMA table_info(users)');
  return cols.some((col) => col.name === 'staffing_mode');
}

interface UserRow extends SyncRow {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  employee_no: string | null;
  gender: Gender;
  hire_date: string | null;
  job_title: string | null;
  account: string;
  photo_uri: string | null;
  status: UserStatus;
  review_note: string | null;
  staffing_mode?: string | null;
}

export interface UserSecretRow {
  id: string;
  password_hash: string;
  password_salt: string;
  password_algo: string;
  password_iterations: number;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fullName: row.full_name,
    phone: row.phone,
    employeeNo: row.employee_no,
    gender: row.gender,
    hireDate: row.hire_date,
    jobTitle: row.job_title,
    account: row.account,
    photoUri: row.photo_uri,
    status: row.status,
    reviewNote: row.review_note,
    staffingMode:
      row.staffing_mode === STAFFING_MODES.MOBILE || row.staffing_mode === STAFFING_MODES.TRAINEE
        ? row.staffing_mode
        : STAFFING_MODES.FIXED,
    ...mapSync(row),
  };
}

export interface UserInsert {
  tenantId: string;
  fullName: string;
  phone: string;
  employeeNo: string;
  gender: Gender;
  hireDate: string;
  jobTitle: string;
  account: string;
  password: PasswordRecord;
  photoUri?: string | null;
  status: UserStatus;
  staffingMode?: StaffingMode;
  createdBy: string | null;
  deviceId: string | null;
}

export async function insertUser(input: UserInsert): Promise<User> {
  const id = createId();
  const ts = nowIso();
  const staffing = input.staffingMode ?? STAFFING_MODES.FIXED;
  const hasStaffing = await usersHaveStaffingModeColumn();
  if (hasStaffing) {
    await getDatabase().run(
      `INSERT INTO users (
        id, tenant_id, full_name, phone, employee_no, gender, hire_date, job_title, account,
        password_hash, password_salt, password_algo, password_iterations, photo_uri, status, review_note,
        created_by, created_at, updated_at, deleted_at, version, sync_status, device_id, staffing_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 1, 'local', ?, ?)`,
      [
        id,
        input.tenantId,
        input.fullName.trim(),
        input.phone.trim(),
        input.employeeNo.trim(),
        input.gender,
        input.hireDate,
        input.jobTitle.trim(),
        input.account.trim(),
        input.password.hash,
        input.password.salt,
        input.password.algo,
        input.password.iterations,
        input.photoUri ?? null,
        input.status,
        input.createdBy,
        ts,
        ts,
        input.deviceId,
        staffing,
      ],
    );
  } else {
    await getDatabase().run(
      `INSERT INTO users (
        id, tenant_id, full_name, phone, employee_no, gender, hire_date, job_title, account,
        password_hash, password_salt, password_algo, password_iterations, photo_uri, status, review_note,
        created_by, created_at, updated_at, deleted_at, version, sync_status, device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 1, 'local', ?)`,
      [
        id,
        input.tenantId,
        input.fullName.trim(),
        input.phone.trim(),
        input.employeeNo.trim(),
        input.gender,
        input.hireDate,
        input.jobTitle.trim(),
        input.account.trim(),
        input.password.hash,
        input.password.salt,
        input.password.algo,
        input.password.iterations,
        input.photoUri ?? null,
        input.status,
        input.createdBy,
        ts,
        ts,
        input.deviceId,
      ],
    );
  }
  const created = await getUserById(id);
  if (!created) {
    throw new Error('建立帳號失敗');
  }
  return created;
}

export async function getUserById(id: string, tenantId?: string | null): Promise<User | null> {
  const row = tenantId
    ? await getDatabase().getFirst<UserRow>(
        'SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [id, tenantId],
      )
    : await getDatabase().getFirst<UserRow>(
        'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
  return row ? mapUser(row) : null;
}

export async function getUserByAccount(tenantId: string, account: string): Promise<User | null> {
  const row = await getDatabase().getFirst<UserRow>(
    'SELECT * FROM users WHERE tenant_id = ? AND account = ? AND deleted_at IS NULL',
    [tenantId, account.trim()],
  );
  return row ? mapUser(row) : null;
}

export async function getUserSecret(userId: string): Promise<UserSecretRow | null> {
  return getDatabase().getFirst<UserSecretRow>(
    'SELECT id, password_hash, password_salt, password_algo, password_iterations FROM users WHERE id = ?',
    [userId],
  );
}

export async function listUsersByTenant(tenantId: string): Promise<User[]> {
  const rows = await getDatabase().getAll<UserRow>(
    'SELECT * FROM users WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [tenantId],
  );
  return rows.map(mapUser);
}

export async function listUsersByStatus(tenantId: string, status: UserStatus): Promise<User[]> {
  const rows = await getDatabase().getAll<UserRow>(
    'SELECT * FROM users WHERE tenant_id = ? AND status = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [tenantId, status],
  );
  return rows.map(mapUser);
}

export async function updateUserProfile(
  id: string,
  patch: {
    fullName?: string;
    phone?: string;
    employeeNo?: string;
    gender?: Gender;
    hireDate?: string;
    jobTitle?: string;
    photoUri?: string | null;
    staffingMode?: StaffingMode;
  },
): Promise<User> {
  const current = await getUserById(id);
  if (!current) {
    throw new Error('找不到使用者');
  }
  const hasStaffing = await usersHaveStaffingModeColumn();
  if (hasStaffing) {
    await getDatabase().run(
      `UPDATE users SET
        full_name = ?, phone = ?, employee_no = ?, gender = ?, hire_date = ?, job_title = ?,
        photo_uri = ?, staffing_mode = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ?`,
      [
        patch.fullName?.trim() ?? current.fullName,
        patch.phone?.trim() ?? current.phone,
        patch.employeeNo?.trim() ?? current.employeeNo,
        patch.gender ?? current.gender,
        patch.hireDate ?? current.hireDate,
        patch.jobTitle?.trim() ?? current.jobTitle,
        patch.photoUri === undefined ? current.photoUri : patch.photoUri,
        patch.staffingMode ?? current.staffingMode,
        nowIso(),
        id,
      ],
    );
  } else {
    await getDatabase().run(
      `UPDATE users SET
        full_name = ?, phone = ?, employee_no = ?, gender = ?, hire_date = ?, job_title = ?,
        photo_uri = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
       WHERE id = ?`,
      [
        patch.fullName?.trim() ?? current.fullName,
        patch.phone?.trim() ?? current.phone,
        patch.employeeNo?.trim() ?? current.employeeNo,
        patch.gender ?? current.gender,
        patch.hireDate ?? current.hireDate,
        patch.jobTitle?.trim() ?? current.jobTitle,
        patch.photoUri === undefined ? current.photoUri : patch.photoUri,
        nowIso(),
        id,
      ],
    );
  }
  const updated = await getUserById(id);
  if (!updated) {
    throw new Error('更新個人資料失敗');
  }
  return updated;
}

export async function updateUserPassword(id: string, password: PasswordRecord): Promise<void> {
  await getDatabase().run(
    `UPDATE users SET
      password_hash = ?, password_salt = ?, password_algo = ?, password_iterations = ?,
      updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [password.hash, password.salt, password.algo, password.iterations, nowIso(), id],
  );
}

export async function updateUserStatus(
  id: string,
  status: UserStatus,
  reviewNote: string | null,
): Promise<User> {
  await getDatabase().run(
    `UPDATE users SET status = ?, review_note = ?, updated_at = ?, version = version + 1, sync_status = 'pending'
     WHERE id = ?`,
    [status, reviewNote, nowIso(), id],
  );
  const updated = await getUserById(id);
  if (!updated) {
    throw new Error('更新帳號狀態失敗');
  }
  return updated;
}

export async function findAccountGlobally(account: string): Promise<User | null> {
  const row = await getDatabase().getFirst<UserRow>(
    'SELECT * FROM users WHERE account = ? AND deleted_at IS NULL',
    [account.trim()],
  );
  return row ? mapUser(row) : null;
}
