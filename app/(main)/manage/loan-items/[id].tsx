import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { ITEM_LOAN_TRANSACTION_TYPE_LABELS, LOAN_ITEM_STATUS_LABELS } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { getLoanItemForActor, outstandingForBorrow, reportLoanItemIssueForActor } from '@/services/loanItemService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { ItemLoanTransaction, LoanItem } from '@/types';

export default function ManageLoanItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [item, setItem] = useState<LoanItem | null>(null);
  const [transactions, setTransactions] = useState<ItemLoanTransaction[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getLoanItemForActor(actor, id);
    setItem(detail.item);
    setTransactions(detail.transactions);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const open = transactions.find((row) => row.transactionType === 'borrow' && outstandingForBorrow(transactions, row.id) > 0);

  return (
    <Screen>
      <ErrorBanner message={error} />
      {item ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{item.name}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {item.itemCode} · {LOAN_ITEM_STATUS_LABELS[item.status]} · 可借 {item.availableQuantity} / {item.totalQuantity}
          </Text>
          {item.requiresDeposit ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
              原則需押金，參考金額 {item.depositReferenceAmount ?? '—'}（本階段不收款、不退款）
            </Text>
          ) : null}
        </QinCard>
      ) : null}
      {item && can('loanItem.manage') ? (
        <>
          <QinInput label="遺失／損壞說明" value={note} onChangeText={setNote} multiline />
          <QinButton
            label="登記遺失"
            variant="secondary"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void reportLoanItemIssueForActor(actor, {
                itemId: item.id,
                borrowTransactionId: open?.id,
                type: 'lost',
                quantity: 1,
                note,
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '登記失敗'))
                .finally(() => setBusy(false));
            }}
          />
          <QinButton
            label="登記損壞"
            variant="ghost"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void reportLoanItemIssueForActor(actor, {
                itemId: item.id,
                borrowTransactionId: open?.id,
                type: 'damaged',
                quantity: 1,
                note,
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '登記失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm })}>
        借還時間軸
      </Text>
      {transactions.map((row) => (
        <QinCard key={row.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
            {ITEM_LOAN_TRANSACTION_TYPE_LABELS[row.transactionType]} {row.quantity} 件 · {row.borrowerNameSnapshot}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
            {formatDateTimeZh(row.createdAt)}
            {row.dueAt ? ` · 應還 ${formatDateTimeZh(row.dueAt)}` : ''}
            {row.compensationReviewRequired ? ' · 需賠償審核' : ''}
          </Text>
        </QinCard>
      ))}
    </Screen>
  );
}
