import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { OCCUPANCY_TYPE_LABELS, UNIT_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listSiteUnitsForActor } from '@/services/unitService';
import type { SiteUnit } from '@/types';

export default function UnitsScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<SiteUnit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listSiteUnitsForActor(actor, currentSite?.id ?? null));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('unit.manage') ? (
        <QinButton label="新增戶別" onPress={() => router.push('/(main)/manage/units/new')} />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="尚未建立戶別"
          subtitle="先建立戶別後才能登錄住戶、訪客與包裹"
          icon="home-outline"
          actionLabel={can('unit.manage') ? '建立第一戶' : undefined}
          onAction={can('unit.manage') ? () => router.push('/(main)/manage/units/new') : undefined}
        />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.displayName}
            subtitle={`${OCCUPANCY_TYPE_LABELS[item.occupancyType]}${item.building ? ` · ${item.building}` : ''}${item.floor ? ` · ${item.floor}樓` : ''}`}
            meta={UNIT_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/units/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
