import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ButtonRow, QinButton } from '@/components/ui/QinButton';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { GENDER_LABELS, USER_STATUS_LABELS } from '@/constants/app';
import { STAFFING_MODE_LABELS, STAFFING_MODES, isStaffingMode } from '@/constants/staffing';
import { setUserStaffingMode } from '@/services/scheduleService';
import { useSession } from '@/providers/SessionProvider';
import { listSites } from '@/repositories/siteRepository';
import { listUserRoles } from '@/repositories/permissionRepository';
import { listUserSitePermissions } from '@/repositories/userSiteRepository';
import { getUserById } from '@/repositories/userRepository';
import { listRoles } from '@/repositories/roleRepository';
import { assignRoleToUser, removeUserRoleAssignment } from '@/services/roleService';
import { assignUserToSite, removeUserSite } from '@/services/siteService';
import { setAccountStatus } from '@/services/userService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';
import type { Role, Site, User, UserRole, UserSitePermission } from '@/types';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, tenant, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [grants, setGrants] = useState<UserSitePermission[]>([]);
  const [roleId, setRoleId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [permanentRole, setPermanentRole] = useState(true);
  const [permanentSite, setPermanentSite] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !tenant) return;
    const item = await getUserById(id, tenant.id);
    setUser(item);
    setRoles(await listRoles(tenant.id));
    setSites((await listSites(tenant.id)).filter((site) => site.status === 'active'));
    setUserRoles(await listUserRoles(id, tenant.id));
    setGrants(await listUserSitePermissions(id, tenant.id));
  }, [id, tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) {
    return (
      <Screen>
        <Text style={textStyle(colors, fontScale, 'md')}>找不到帳號</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{user.fullName}</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        {user.account} · {USER_STATUS_LABELS[user.status]} · {GENDER_LABELS[user.gender]}
      </Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
        員工編號 {user.employeeNo ?? '—'} · 職稱 {user.jobTitle ?? '—'} · 到職 {formatDateZh(user.hireDate)} · {STAFFING_MODE_LABELS[user.staffingMode]}
      </Text>
      {can('users.update') ? (
        <QinSelect
          label="人員勤務型態"
          value={user.staffingMode}
          options={Object.values(STAFFING_MODES).map((value) => ({ value, label: STAFFING_MODE_LABELS[value] }))}
          onChange={(value) => {
            if (!isStaffingMode(value)) return;
            void setUserStaffingMode(actor, user.id, value)
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : '更新失敗'));
          }}
        />
      ) : null}
      <ErrorBanner message={error} />
      {can('users.update') && user.status === 'active' ? (
        <QinButton label="停權" variant="danger" onPress={() => void setAccountStatus(actor, user.id, 'suspended').then(load)} />
      ) : null}
      {can('users.update') && user.status === 'suspended' ? (
        <QinButton label="恢復帳號" onPress={() => void setAccountStatus(actor, user.id, 'active').then(load)} />
      ) : null}

      <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm })}>
        角色授權
      </Text>
      {userRoles.map((item) => {
        const role = roles.find((r) => r.id === item.roleId);
        return (
          <ButtonRow key={item.id}>
            <Text style={[textStyle(colors, fontScale, 'sm'), { flex: 1 }]}>
              {role?.name ?? item.roleId}
              {item.isPermanent ? ' · 永久' : ''}
            </Text>
            {can('users.assignRole') || can('users.update') ? (
              <QinButton
                label="移除"
                variant="ghost"
                onPress={() => void removeUserRoleAssignment(actor, item.id, user.fullName).then(load)}
              />
            ) : null}
          </ButtonRow>
        );
      })}
      {(can('users.assignRole') || can('users.update')) && roles.length > 0 ? (
        <>
          <QinSelect
            label="指派角色"
            value={roleId}
            options={roles.filter((r) => r.status === 'active').map((r) => ({ value: r.id, label: r.name }))}
            onChange={setRoleId}
          />
          <SwitchRow label="永久授權" value={permanentRole} onValueChange={setPermanentRole} />
          <QinButton
            label="新增角色"
            variant="secondary"
            onPress={() => {
              void (async () => {
                const role = roles.find((r) => r.id === roleId);
                if (!role || !tenant) return;
                setError(null);
                try {
                  await assignRoleToUser(actor, {
                    tenantId: tenant.id,
                    userId: user.id,
                    roleId: role.id,
                    startsAt: null,
                    expiresAt: null,
                    isPermanent: permanentRole,
                    targetName: user.fullName,
                    roleName: role.name,
                  });
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : '指派失敗');
                }
              })();
            }}
          />
        </>
      ) : null}

      <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm })}>
        案場授權
      </Text>
      {grants.map((grant) => {
        const site = sites.find((s) => s.id === grant.siteId);
        return (
          <ButtonRow key={grant.id}>
            <Text style={[textStyle(colors, fontScale, 'sm'), { flex: 1 }]}>
              {site?.name ?? grant.siteId}
              {grant.isPermanent ? ' · 永久' : ''}
            </Text>
            {can('sites.assign') ? (
              <QinButton
                label="移除"
                variant="ghost"
                onPress={() => void removeUserSite(actor, grant.id, user.fullName, site?.name ?? '案場').then(load)}
              />
            ) : null}
          </ButtonRow>
        );
      })}
      {can('sites.assign') && sites.length > 0 ? (
        <>
          <QinSelect
            label="授權案場"
            value={siteId}
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
            onChange={setSiteId}
          />
          <SwitchRow label="永久授權" value={permanentSite} onValueChange={setPermanentSite} />
          <QinButton
            label="新增案場授權"
            variant="secondary"
            onPress={() => {
              void (async () => {
                const site = sites.find((s) => s.id === siteId);
                if (!site || !tenant) return;
                setError(null);
                try {
                  await assignUserToSite(actor, {
                    tenantId: tenant.id,
                    userId: user.id,
                    siteId: site.id,
                    startsAt: null,
                    expiresAt: null,
                    isPermanent: permanentSite,
                    targetName: user.fullName,
                    siteName: site.name,
                  });
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : '授權失敗');
                }
              })();
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
