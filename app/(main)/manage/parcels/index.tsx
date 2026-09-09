import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinSelect } from '@/components/ui/QinSelect';
import { PARCEL_KIND_LABELS, PARCEL_STATUS_LABELS, type ParcelStatus } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listParcelsForActor } from '@/services/parcelService';
import type { Parcel } from '@/types';

const STATUS_OPTIONS: Array<{ value: ParcelStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部狀態' },
  ...Object.entries(PARCEL_STATUS_LABELS).map(([value, label]) => ({
    value: value as ParcelStatus,
    label,
  })),
];

export default function ManageParcelsScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [status, setStatus] = useState<ParcelStatus | 'all'>('all');
  const [rows, setRows] = useState<Parcel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(
      await listParcelsForActor(actor, {
        siteId: currentSite?.id ?? null,
        status: status === 'all' ? null : status,
      }),
    );
  }, [actor, currentSite?.id, status]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect label="狀態" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      {rows.length === 0 ? (
        <EmptyState title="尚無包裹紀錄" subtitle="勤務人員完成到件登記後會顯示在這裡" icon="cube-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.recipientNameSnapshot} · ${PARCEL_KIND_LABELS[item.parcelKind]}`}
            subtitle={`${item.unitLabelSnapshot}${item.trackingNo ? ` · ${item.trackingNo}` : ''}`}
            meta={PARCEL_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/parcels/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
