import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { useSession } from '@/providers/SessionProvider';
import { listPatrolPointsForActor } from '@/services/patrolPointService';
import { issuePatrolPointQr } from '@/services/qrAssetService';
import type { PatrolPoint } from '@/types';

export default function NewPatrolPointQrScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [rows, setRows] = useState<PatrolPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void listPatrolPointsForActor(actor, currentSite?.id ?? null).then(setRows);
    }, [actor, currentSite?.id]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {rows.map((point) => (
        <ListRow
          key={point.id}
          title={point.name}
          subtitle={point.code}
          onPress={() => {
            if (busyId) return;
            setBusyId(point.id);
            void issuePatrolPointQr(actor, point.id)
              .then((asset) => router.replace({ pathname: '/(main)/manage/qr-assets/[id]', params: { id: asset.id } }))
              .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
              .finally(() => setBusyId(null));
          }}
        />
      ))}
    </Screen>
  );
}
