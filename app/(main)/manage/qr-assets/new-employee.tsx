import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { listAccounts } from '@/services/userService';
import { issueEmployeeQr } from '@/services/qrAssetService';
import type { User } from '@/types';

export default function NewEmployeeQrScreen() {
  const router = useRouter();
  const { actor, tenant } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!tenant) return;
      void listAccounts(tenant.id, actor).then(setUsers).catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [actor, tenant]),
  );

  const filtered = users.filter((user) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return user.fullName.toLowerCase().includes(q) || (user.employeeNo ?? '').toLowerCase().includes(q);
  });

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="搜尋姓名或員工編號" value={query} onChangeText={setQuery} />
      {filtered.map((user) => (
        <ListRow
          key={user.id}
          title={user.fullName}
          subtitle={`${user.employeeNo ?? '—'} · ${user.jobTitle ?? '—'}`}
          onPress={() => {
            if (busyId) return;
            setBusyId(user.id);
            void issueEmployeeQr(actor, user.id)
              .then((asset) => router.replace({ pathname: '/(main)/manage/qr-assets/[id]', params: { id: asset.id } }))
              .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
              .finally(() => setBusyId(null));
          }}
        />
      ))}
    </Screen>
  );
}
