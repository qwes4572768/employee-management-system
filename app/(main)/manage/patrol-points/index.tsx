import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { useSession } from '@/providers/SessionProvider';
import { listPatrolPointsForActor } from '@/services/patrolPointService';
import type { PatrolPoint } from '@/types';

export default function PatrolPointsScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<PatrolPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listPatrolPointsForActor(actor, currentSite?.id ?? null));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('patrolPoint.manage') ? (
        <QinButton label="新增巡邏點" onPress={() => router.push('/(main)/manage/patrol-points/new')} />
      ) : null}
      {rows.map((item) => (
        <ListRow
          key={item.id}
          title={item.name}
          subtitle={`${item.code} · ${item.status === 'active' ? '啟用' : '停用'}`}
          meta={[item.requireQr ? 'QR' : null, item.requireGps ? 'GPS' : null, item.requirePhoto ? '照片' : null]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => router.push({ pathname: '/(main)/manage/patrol-points/[id]', params: { id: item.id } })}
        />
      ))}
    </Screen>
  );
}
