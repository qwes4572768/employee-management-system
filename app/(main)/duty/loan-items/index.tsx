import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { LOAN_ITEM_STATUS_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listLoanItemsForActor } from '@/services/loanItemService';
import type { LoanItem } from '@/types';

export default function DutyLoanItemsScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [rows, setRows] = useState<LoanItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listLoanItemsForActor(actor, currentSite?.id ?? null));
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
        <EmptyState title="尚未建立公共物品" subtitle="請由物品借用中心先建立主檔" icon="cube-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            subtitle={`可借 ${item.availableQuantity} / ${item.totalQuantity}${item.storageLocation ? ` · ${item.storageLocation}` : ''}`}
            meta={LOAN_ITEM_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/duty/loan-items/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
