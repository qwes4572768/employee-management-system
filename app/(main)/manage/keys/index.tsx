import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { MANAGED_KEY_STATUS_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listManagedKeysForActor } from '@/services/keyService';
import type { ManagedKey } from '@/types';

export default function ManageKeysScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<ManagedKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listManagedKeysForActor(actor, currentSite?.id ?? null));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('key.manage') ? <QinButton label="新增鑰匙" onPress={() => router.push('/(main)/manage/keys/new')} /> : null}
      {rows.length === 0 ? (
        <EmptyState title="尚未建立鑰匙" subtitle="機房、消防室、公設與備用鑰匙可在此管理" icon="key-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            subtitle={`${item.keyCode}${item.storageLocation ? ` · ${item.storageLocation}` : ''}`}
            meta={MANAGED_KEY_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/keys/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
