import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ButtonRow, QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { GENDER_LABELS } from '@/constants/app';
import { buildPermissionCatalog } from '@/constants/permissions';
import { useSession } from '@/providers/SessionProvider';
import { listRoles } from '@/repositories/roleRepository';
import { listSites } from '@/repositories/siteRepository';
import { getUserById } from '@/repositories/userRepository';
import { reviewAccount } from '@/services/authService';
import { addUserPermissionOverride, assignRoleToUser } from '@/services/roleService';
import { assignUserToSite } from '@/services/siteService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';
import type { Role, Site, User } from '@/types';

export default function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { actor, tenant } = useSession();
  const { colors, fontScale } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [roleId, setRoleId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [permanentRole, setPermanentRole] = useState(true);
  const [permanentSite, setPermanentSite] = useState(true);
  const [extraPerm, setExtraPerm] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const extraOptions = buildPermissionCatalog().map((item) => ({ value: item.permKey, label: item.name }));

  useEffect(() => {
    if (!id || !tenant) return;
    void (async () => {
      const item = await getUserById(id);
      setUser(item);
      const rs = await listRoles(tenant.id);
      setRoles(rs.filter((role) => role.status === 'active'));
      const ss = await listSites(tenant.id);
      setSites(ss.filter((site) => site.status === 'active'));
    })();
  }, [id, tenant]);

  if (!user) {
    return (
      <Screen>
        <Text style={textStyle(colors, fontScale, 'md')}>找不到申請</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{user.fullName}</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
        {user.account} · {GENDER_LABELS[user.gender]} · {user.jobTitle ?? '—'} · 到職 {formatDateZh(user.hireDate)}
      </Text>
      <ErrorBanner message={error} />
      <QinSelect
        label="核准後角色"
        value={roleId}
        options={roles.map((r) => ({ value: r.id, label: r.name }))}
        onChange={setRoleId}
      />
      <SwitchRow label="角色永久授權" value={permanentRole} onValueChange={setPermanentRole} />
      <QinSelect
        label="授權案場（可先選一個，之後可再加）"
        value={siteId}
        options={[{ value: '', label: '稍後再指定' }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
        onChange={setSiteId}
      />
      <SwitchRow label="案場永久授權" value={permanentSite} onValueChange={setPermanentSite} />
      <QinSelect
        label="個別額外權限（選填）"
        value={extraPerm}
        options={[{ value: '', label: '不另外加權限' }, ...extraOptions]}
        onChange={setExtraPerm}
      />
      <QinInput label="審核備註" value={note} onChangeText={setNote} multiline />
      <ButtonRow>
        <QinButton
          label="核准開通"
          onPress={() => {
            void (async () => {
              if (!tenant) return;
              setError(null);
              try {
                await reviewAccount(actor, user.id, 'active', note || null);
                if (roleId) {
                  const role = roles.find((r) => r.id === roleId);
                  if (role) {
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
                  }
                }
                if (siteId) {
                  const site = sites.find((s) => s.id === siteId);
                  if (site) {
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
                  }
                }
                if (extraPerm) {
                  await addUserPermissionOverride(actor, {
                    tenantId: tenant.id,
                    userId: user.id,
                    permKey: extraPerm,
                    effect: 'allow',
                    startsAt: null,
                    expiresAt: null,
                    isPermanent: true,
                    targetName: user.fullName,
                  });
                }
                router.back();
              } catch (err) {
                setError(err instanceof Error ? err.message : '核准失敗');
              }
            })();
          }}
        />
        <QinButton
          label="退回補資料"
          variant="secondary"
          onPress={() => void reviewAccount(actor, user.id, 'returned', note || '請補齊資料').then(() => router.back())}
        />
        <QinButton
          label="拒絕"
          variant="danger"
          onPress={() => void reviewAccount(actor, user.id, 'rejected', note || '申請未通過').then(() => router.back())}
        />
      </ButtonRow>
    </Screen>
  );
}
