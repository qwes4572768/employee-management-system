import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import {
  KEY_TRANSACTION_TYPE_LABELS,
  MANAGED_KEY_STATUS_LABELS,
  MANAGED_KEY_TYPE_LABELS,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { getManagedKeyForActor, reportKeyIssueForActor } from '@/services/keyService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { KeyTransaction, ManagedKey } from '@/types';

export default function ManageKeyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [key, setKey] = useState<ManagedKey | null>(null);
  const [transactions, setTransactions] = useState<KeyTransaction[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getManagedKeyForActor(actor, id);
    setKey(detail.key);
    setTransactions(detail.transactions);
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
            {key.keyCode} · {MANAGED_KEY_TYPE_LABELS[key.keyType]} · {MANAGED_KEY_STATUS_LABELS[key.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>存放位置：{key.storageLocation ?? '—'}</Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: 8 })}>
            遺失／損壞只建立管理紀錄與賠償審核，不會直接扣薪或罰款。
          </Text>
        </QinCard>
      ) : null}
      {key && can('key.manage') ? (
        <>
          <QinInput label="遺失／損壞說明" value={note} onChangeText={setNote} multiline />
          <QinButton
            label="登記遺失"
            variant="secondary"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void reportKeyIssueForActor(actor, { keyId: key.id, type: 'lost', note })
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
              void reportKeyIssueForActor(actor, { keyId: key.id, type: 'damaged', note })
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
      {transactions.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
            {KEY_TRANSACTION_TYPE_LABELS[item.transactionType]} · {item.borrowerNameSnapshot}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
            {formatDateTimeZh(item.createdAt)}
            {item.dueAt ? ` · 應還 ${formatDateTimeZh(item.dueAt)}` : ''}
            {item.compensationReviewRequired ? ' · 需賠償審核' : ''}
          </Text>
        </QinCard>
      ))}
    </Screen>
  );
}
