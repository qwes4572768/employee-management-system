import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ButtonRow, QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { ROLE_KEYS } from '@/constants/app';
import { PERMISSION_MODULES, buildPermissionCatalog } from '@/constants/permissions';
import { useSession } from '@/providers/SessionProvider';
import { listRolePermissionKeys } from '@/repositories/permissionRepository';
import { getRoleById } from '@/repositories/roleRepository';
import { renameRole, setRoleStatus, updateRolePermissionSet } from '@/services/roleService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Role } from '@/types';

export default function RoleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, tenant, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const catalog = buildPermissionCatalog();
  const locked = role?.roleKey === ROLE_KEYS.SUPER_ADMIN;

  const load = useCallback(async () => {
    if (!id) return;
    const item = await getRoleById(id);
    setRole(item);
    if (item) {
      setName(item.name);
      setDescription(item.description ?? '');
      setSelected(await listRolePermissionKeys(item.id));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!role) {
    return (
      <Screen>
        <Text style={textStyle(colors, fontScale, 'md')}>找不到角色</Text>
      </Screen>
    );
  }

  const toggle = (key: string) => {
    if (locked || !can('permissions.update')) return;
    setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        系統 Key：{role.roleKey}
      </Text>
      <ErrorBanner message={error} />
      <QinInput label="角色名稱" value={name} onChangeText={setName} editable={can('roles.update')} />
      <QinInput label="說明" value={description} onChangeText={setDescription} multiline editable={can('roles.update')} />
      {can('roles.update') ? (
        <QinButton
          label="儲存名稱"
          onPress={() => void renameRole(actor, role.id, name, description).then(load).catch((err) => setError(err.message))}
        />
      ) : null}
      <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm })}>
        權限
      </Text>
      {locked ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
          企業總管理員擁有完整權限，不可縮減。
        </Text>
      ) : null}
      {PERMISSION_MODULES.map((mod) => (
        <View key={mod.key} style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '700', marginBottom: 8 })}>{mod.name}</Text>
          {catalog
            .filter((item) => item.module === mod.key)
            .map((item) => {
              const on = selected.includes(item.permKey);
              return (
                <Pressable
                  key={item.permKey}
                  onPress={() => toggle(item.permKey)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.border,
                    backgroundColor: on ? colors.accentMuted : 'transparent',
                  }}
                >
                  <Text style={textStyle(colors, fontScale, 'sm', { color: on ? colors.accent : colors.text })}>
                    {on ? '● ' : '○ '}
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      ))}
      {can('permissions.update') && !locked && tenant ? (
        <QinButton
          label="儲存權限"
          onPress={() =>
            void updateRolePermissionSet(actor, tenant.id, role.id, selected)
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : '儲存失敗'))
          }
        />
      ) : null}
      <ButtonRow>
        {can('roles.update') && !role.isSystem && role.status === 'active' ? (
          <QinButton label="停用角色" variant="danger" onPress={() => void setRoleStatus(actor, role.id, 'inactive').then(load)} />
        ) : null}
        {can('roles.update') && !role.isSystem && role.status === 'inactive' ? (
          <QinButton label="重新啟用" variant="secondary" onPress={() => void setRoleStatus(actor, role.id, 'active').then(load)} />
        ) : null}
      </ButtonRow>
    </Screen>
  );
}
