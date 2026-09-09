import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { VISITOR_KIND_LABELS, VISITOR_PASS_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listVisitorPassesForActor } from '@/services/visitorService';
import type { VisitorPass } from '@/types';

export default function DutyVisitorsScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [rows, setRows] = useState<VisitorPass[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await listVisitorPassesForActor(actor, { siteId: currentSite?.id ?? null });
    setRows(all.filter((item) => item.status === 'registered' || item.status === 'checked_in'));
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
        <EmptyState title="目前沒有待進出訪客" subtitle="請先完成訪客登記" icon="walk-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.visitorName} · ${VISITOR_KIND_LABELS[item.visitorKind]}`}
            subtitle={item.unitLabelSnapshot}
            meta={VISITOR_PASS_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/duty/visitors/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
