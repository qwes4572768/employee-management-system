import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { RESIDENT_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listResidentsForActor } from '@/services/residentService';
import type { Resident } from '@/types';

export default function ResidentsScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<Resident[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listResidentsForActor(actor, { siteId: currentSite?.id ?? null }));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('resident.manage') ? (
        <QinButton label="新增住戶" onPress={() => router.push('/(main)/manage/residents/new')} />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="尚未登錄住戶"
          subtitle="住戶不是系統帳號，需由管理人員建立"
          icon="people-outline"
          actionLabel={can('resident.manage') ? '建立第一位住戶' : undefined}
          onAction={can('resident.manage') ? () => router.push('/(main)/manage/residents/new') : undefined}
        />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.fullName}
            subtitle={item.phone ?? '未留電話'}
            meta={RESIDENT_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/residents/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
