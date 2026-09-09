import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { PARKING_VIOLATION_STATUS_LABELS, PARKING_VIOLATION_TYPE_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listParkingViolationsForActor } from '@/services/vehicleService';
import type { ParkingViolation } from '@/types';

export default function ParkingViolationsScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [rows, setRows] = useState<ParkingViolation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listParkingViolationsForActor(actor, currentSite?.id ?? null));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {rows.length === 0 ? (
        <EmptyState title="目前沒有占用異常" subtitle="陌生車占私人車位或臨停逾時會顯示在這裡" icon="alert-circle-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.plateNoSnapshot} · ${PARKING_VIOLATION_TYPE_LABELS[item.violationType]}`}
            subtitle={item.description ?? '未填說明'}
            meta={PARKING_VIOLATION_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/parking-violations/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
