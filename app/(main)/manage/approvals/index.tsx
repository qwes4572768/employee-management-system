import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { useSession } from '@/providers/SessionProvider';
import { listPendingAccounts } from '@/services/userService';
import type { User } from '@/types';

export default function ApprovalsScreen() {
  const router = useRouter();
  const { tenant } = useSession();
  const [users, setUsers] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (!tenant) return;
    setUsers(await listPendingAccounts(tenant.id));
  }, [tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {users.length === 0 ? (
        <EmptyState title="目前沒有待審核帳號" subtitle="新使用者註冊後會顯示在這裡" icon="checkmark-done-outline" />
      ) : (
        users.map((user) => (
          <ListRow
            key={user.id}
            title={user.fullName}
            subtitle={`${user.account} · ${user.jobTitle ?? '—'}`}
            meta="待審核"
            onPress={() => router.push(`/(main)/manage/approvals/${user.id}`)}
          />
        ))
      )}
    </Screen>
  );
}
