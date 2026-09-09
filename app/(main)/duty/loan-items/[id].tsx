import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { LOAN_BORROWER_TYPE_LABELS, LOAN_ITEM_STATUS_LABELS, type LoanBorrowerType } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import {
  borrowLoanItemForActor,
  getLoanItemForActor,
  outstandingForBorrow,
  returnLoanItemForActor,
} from '@/services/loanItemService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { ItemLoanTransaction, LoanItem } from '@/types';

const BORROWER_OPTIONS = (Object.keys(LOAN_BORROWER_TYPE_LABELS) as LoanBorrowerType[]).map((value) => ({
  value,
  label: LOAN_BORROWER_TYPE_LABELS[value],
}));

export default function DutyLoanItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [item, setItem] = useState<LoanItem | null>(null);
  const [transactions, setTransactions] = useState<ItemLoanTransaction[]>([]);
  const [borrowerType, setBorrowerType] = useState<LoanBorrowerType>('staff');
  const [borrowerName, setBorrowerName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [borrowId, setBorrowId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getLoanItemForActor(actor, id);
    setItem(detail.item);
    setTransactions(detail.transactions);
    const open = detail.transactions.find(
      (row) => row.transactionType === 'borrow' && outstandingForBorrow(detail.transactions, row.id) > 0,
    );
    setBorrowId((current) => current || open?.id || '');
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const openBorrows = transactions.filter(
    (row) => row.transactionType === 'borrow' && outstandingForBorrow(transactions, row.id) > 0,
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {item ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{item.name}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {item.itemCode} · {LOAN_ITEM_STATUS_LABELS[item.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
            目前可借 {item.availableQuantity} / {item.totalQuantity}
            {item.requiresDeposit ? ' · 原則需押金（本階段不收款）' : ''}
          </Text>
        </QinCard>
      ) : null}
      {item && can('loanItem.borrow') ? (
        <>
          <QinSelect label="借用人類型" value={borrowerType} options={BORROWER_OPTIONS} onChange={(value) => setBorrowerType(value as LoanBorrowerType)} />
          <QinInput label="借用人姓名" value={borrowerName} onChangeText={setBorrowerName} />
          <QinInput label="數量" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          <QinInput label="用途" value={purpose} onChangeText={setPurpose} />
          <QinInput label="應還時間（選填）" value={dueAt} onChangeText={setDueAt} placeholder="YYYY-MM-DDTHH:mm" />
          <QinButton
            label="借出物品"
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              void borrowLoanItemForActor(actor, {
                itemId: id,
                quantity: Number(quantity),
                borrowerType,
                borrowerName,
                purpose,
                dueAt: dueAt.trim() ? new Date(dueAt).toISOString() : null,
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '借出失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      {openBorrows.length > 0 && can('loanItem.return') ? (
        <>
          <QinSelect
            label="歸還哪一筆借用"
            value={borrowId}
            options={openBorrows.map((row) => ({
              value: row.id,
              label: `${row.borrowerNameSnapshot} · 尚餘 ${outstandingForBorrow(transactions, row.id)} · ${row.borrowedAt ? formatDateTimeZh(row.borrowedAt) : ''}`,
            }))}
            onChange={setBorrowId}
          />
          <QinInput label="歸還數量" value={returnQuantity} onChangeText={setReturnQuantity} keyboardType="number-pad" />
          <QinButton
            label="歸還物品"
            variant="secondary"
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              void returnLoanItemForActor(actor, {
                itemId: id,
                borrowTransactionId: borrowId,
                quantity: Number(returnQuantity),
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '歸還失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
