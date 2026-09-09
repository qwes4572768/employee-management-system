import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { LOAN_ITEM_STATUS_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listLoanItemsForActor } from '@/services/loanItemService';
import type { LoanItem } from '@/types';

export default function ManageLoanItemsScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
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
      {can('loanItem.manage') ? (
        <QinButton label="新增物品" onPress={() => router.push('/(main)/manage/loan-items/new')} />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="尚未建立公共物品" subtitle="推車、雨傘、輪椅與會議設備可在此管理" icon="cube-outline" />
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            subtitle={`可借 ${item.availableQuantity} / ${item.totalQuantity}`}
            meta={LOAN_ITEM_STATUS_LABELS[item.status]}
            onPress={() => router.push({ pathname: '/(main)/manage/loan-items/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
