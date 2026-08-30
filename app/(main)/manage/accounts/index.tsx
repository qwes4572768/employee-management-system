import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { USER_STATUS_LABELS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { listAccounts } from '@/services/userService';
import type { User } from '@/types';

export default function AccountsScreen() {
  const router = useRouter();
  const { tenant } = useSession();
  const [users, setUsers] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (!tenant) return;
    setUsers(await listAccounts(tenant.id));
  }, [tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {users.length === 0 ? (
        <EmptyState title="目前沒有帳號" subtitle="完成系統初始化或等待人員註冊後即可管理帳號" icon="person-outline" />
      ) : (
        users.map((user) => (
          <ListRow
            key={user.id}
            title={user.fullName}
            subtitle={`${user.account} · ${user.jobTitle ?? '—'}`}
            meta={USER_STATUS_LABELS[user.status]}
            onPress={() => router.push(`/(main)/manage/accounts/${user.id}`)}
          />
        ))
      )}
    </Screen>
  );
}
