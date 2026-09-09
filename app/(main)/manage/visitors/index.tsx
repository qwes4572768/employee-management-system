import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinSelect } from '@/components/ui/QinSelect';
import { VISITOR_KIND_LABELS, VISITOR_PASS_STATUS_LABELS, type VisitorPassStatus } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listVisitorPassesForActor } from '@/services/visitorService';
import type { VisitorPass } from '@/types';

const STATUS_OPTIONS: Array<{ value: VisitorPassStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部狀態' },
  ...Object.entries(VISITOR_PASS_STATUS_LABELS).map(([value, label]) => ({
    value: value as VisitorPassStatus,
    label,
  })),
];

export default function ManageVisitorsScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [status, setStatus] = useState<VisitorPassStatus | 'all'>('all');
  const [rows, setRows] = useState<VisitorPass[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(
      await listVisitorPassesForActor(actor, {
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
        <EmptyState title="尚無訪客紀錄" subtitle="勤務人員完成登記後會顯示在這裡" icon="walk-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.visitorName} · ${VISITOR_KIND_LABELS[item.visitorKind]}`}
            subtitle={`${item.unitLabelSnapshot} · ${item.hostNameSnapshot}`}
            meta={VISITOR_PASS_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/visitors/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
