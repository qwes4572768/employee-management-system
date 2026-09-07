import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { PARCEL_KIND_LABELS, PARCEL_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listParcelsForActor } from '@/services/parcelService';
import type { Parcel } from '@/types';

export default function DutyParcelsScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [rows, setRows] = useState<Parcel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await listParcelsForActor(actor, { siteId: currentSite?.id ?? null });
    setRows(all.filter((item) => item.status === 'registered' || item.status === 'notified'));
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
        <EmptyState title="目前沒有待領包裹" subtitle="請先完成到件登記" icon="cube-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.recipientNameSnapshot} · ${PARCEL_KIND_LABELS[item.parcelKind]}`}
            subtitle={`${item.unitLabelSnapshot}${item.locationNote ? ` · ${item.locationNote}` : ''}`}
            meta={PARCEL_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/duty/parcels/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
