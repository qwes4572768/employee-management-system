import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import {
  KEY_TRANSACTION_TYPE_LABELS,
  LOAN_BORROWER_TYPE_LABELS,
  MANAGED_KEY_STATUS_LABELS,
  type LoanBorrowerType,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { checkoutKeyForActor, getManagedKeyForActor, returnKeyForActor } from '@/services/keyService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { KeyTransaction, ManagedKey } from '@/types';

const BORROWER_OPTIONS = (Object.keys(LOAN_BORROWER_TYPE_LABELS) as LoanBorrowerType[]).map((value) => ({
  value,
  label: LOAN_BORROWER_TYPE_LABELS[value],
}));

export default function DutyKeyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [key, setKey] = useState<ManagedKey | null>(null);
  const [checkout, setCheckout] = useState<KeyTransaction | null>(null);
  const [borrowerType, setBorrowerType] = useState<LoanBorrowerType>('staff');
  const [borrowerName, setBorrowerName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getManagedKeyForActor(actor, id);
    setKey(detail.key);
    setCheckout(detail.currentCheckout);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {key ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{key.name}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {key.keyCode} · {MANAGED_KEY_STATUS_LABELS[key.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>存放位置：{key.storageLocation ?? '—'}</Text>
          {checkout ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 8 })}>
              目前借用人 {checkout.borrowerNameSnapshot} · 借出 {checkout.checkedOutAt ? formatDateTimeZh(checkout.checkedOutAt) : '—'}
              {checkout.dueAt ? ` · 應還 ${formatDateTimeZh(checkout.dueAt)}` : ''}
            </Text>
          ) : null}
        </QinCard>
      ) : null}
      {key?.status === 'available' && can('key.checkout') ? (
        <>
          <QinSelect label="借用人類型" value={borrowerType} options={BORROWER_OPTIONS} onChange={(value) => setBorrowerType(value as LoanBorrowerType)} />
          <QinInput label="借用人姓名" value={borrowerName} onChangeText={setBorrowerName} />
          <QinInput label="用途" value={purpose} onChangeText={setPurpose} />
          <QinInput label="應還時間（選填）" value={dueAt} onChangeText={setDueAt} placeholder="YYYY-MM-DDTHH:mm" />
          <QinInput label="備註" value={note} onChangeText={setNote} />
          <QinButton
            label="借出鑰匙"
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              void checkoutKeyForActor(actor, {
                keyId: id,
                borrowerType,
                borrowerName,
                purpose,
                dueAt: dueAt.trim() ? new Date(dueAt).toISOString() : null,
                note,
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '借出失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      {key?.status === 'checked_out' && can('key.return') ? (
        <QinButton
          label="歸還鑰匙"
          loading={busy}
          onPress={() => {
            if (!id) return;
            setBusy(true);
            void returnKeyForActor(actor, { keyId: id, note })
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : '歸還失敗'))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      {checkout ? (
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: spacing.md })}>
          最近借出紀錄：{KEY_TRANSACTION_TYPE_LABELS[checkout.transactionType]}
        </Text>
      ) : null}
    </Screen>
  );
}
