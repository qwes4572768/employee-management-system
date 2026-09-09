import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { RESIDENT_VEHICLE_STATUS_LABELS, RESIDENT_VEHICLE_TYPE_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listResidentVehiclesForActor } from '@/services/vehicleService';
import type { ResidentVehicle } from '@/types';

export default function ManageVehiclesScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<ResidentVehicle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listResidentVehiclesForActor(actor, currentSite?.id ?? null));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('vehicle.manage') ? (
        <QinButton label="新增住戶車輛" onPress={() => router.push('/(main)/manage/vehicles/new')} />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="尚未登錄車輛" subtitle="可為住戶建立車牌主檔" icon="car-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.plateNo}
            subtitle={`${RESIDENT_VEHICLE_TYPE_LABELS[item.vehicleType]}${item.brand ? ` · ${item.brand}` : ''}${item.color ? ` · ${item.color}` : ''}`}
            meta={RESIDENT_VEHICLE_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/vehicles/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
