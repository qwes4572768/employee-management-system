import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { PARKING_SPACE_STATUS_LABELS, PARKING_SPACE_TYPE_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listParkingSpacesForActor } from '@/services/parkingSpaceService';
import type { ParkingSpace } from '@/types';

export default function ManageParkingSpacesScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<ParkingSpace[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listParkingSpacesForActor(actor, { siteId: currentSite?.id ?? null }));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('parkingSpace.manage') ? (
        <QinButton label="新增車位" onPress={() => router.push('/(main)/manage/parking-spaces/new')} />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="尚未建立車位" subtitle="先建立車位後才能指派戶別與登記占用" icon="grid-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.displayName}
            subtitle={`${PARKING_SPACE_TYPE_LABELS[item.spaceType]}${item.zone ? ` · ${item.zone}` : ''}${item.floor ? ` · ${item.floor}` : ''}`}
            meta={PARKING_SPACE_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/parking-spaces/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
