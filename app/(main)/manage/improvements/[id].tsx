import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { getImprovementDetail, reviewImprovement } from '@/services/improvementService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { ImprovementFollowup, ImprovementOrder } from '@/types';

export default function ManageImprovementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [order, setOrder] = useState<ImprovementOrder | null>(null);
  const [followups, setFollowups] = useState<ImprovementFollowup[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getImprovementDetail(actor, id);
    setOrder(detail.order);
    setFollowups(detail.followups);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  if (!order) {
    return (
      <Screen>
        <ErrorBanner message={error} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinCard style={{ marginBottom: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800' })}>{order.title}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>{order.description}</Text>
        <Text style={textStyle(colors, fontScale, 'xs', { marginTop: 8 })}>狀態 {order.status}</Text>
      </QinCard>
      {followups.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
            {item.actorNameSnapshot} · {item.action}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>{item.note}</Text>
        </QinCard>
      ))}
      <QinInput label="審核備註" value={note} onChangeText={setNote} multiline />
      {can('improvement.review') ? (
        <QinButton
          label="退回"
          variant="secondary"
          onPress={() => {
            void reviewImprovement(actor, { orderId: order.id, decision: 'reject', note })
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : '退回失敗'));
          }}
        />
      ) : null}
      {can('improvement.close') || can('improvement.review') ? (
        <QinButton
          label="確認並結案"
          style={{ marginTop: spacing.sm }}
          onPress={() => {
            void (async () => {
              try {
                await reviewImprovement(actor, { orderId: order.id, decision: 'verify', note });
                if (can('improvement.close')) {
                  await reviewImprovement(actor, { orderId: order.id, decision: 'close', note });
                }
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : '確認失敗');
              }
            })();
          }}
        />
      ) : null}
    </Screen>
  );
}
