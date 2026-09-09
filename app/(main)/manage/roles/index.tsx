import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { useSession } from '@/providers/SessionProvider';
import { listRoles } from '@/repositories/roleRepository';
import type { Role } from '@/types';

export default function RolesScreen() {
  const router = useRouter();
  const { tenant, can } = useSession();
  const [roles, setRoles] = useState<Role[]>([]);

  const load = useCallback(async () => {
    if (!tenant) return;
    setRoles(await listRoles(tenant.id));
  }, [tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {can('roles.create') ? (
        <QinButton label="新增角色" onPress={() => router.push('/(main)/manage/roles/new')} style={{ marginBottom: 16 }} />
      ) : null}
      {roles.length === 0 ? (
        <EmptyState title="尚未建立角色" subtitle="系統初始化後會建立必要角色" icon="shield-outline" />
      ) : (
        roles.map((role) => (
          <ListRow
            key={role.id}
            title={role.name}
            subtitle={`${role.roleKey}${role.isSystem ? ' · 系統角色' : ''}`}
            meta={role.status === 'active' ? '啟用' : '停用'}
            onPress={() => router.push(`/(main)/manage/roles/${role.id}`)}
          />
        ))
      )}
    </Screen>
  );
}
