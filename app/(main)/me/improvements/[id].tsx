import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { getImprovementDetail, submitImprovementReply } from '@/services/improvementService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import { captureInspectionPhoto } from '@/utils/inspectionPhoto';
import type { ImprovementFollowup, ImprovementOrder } from '@/types';

export default function MyImprovementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [order, setOrder] = useState<ImprovementOrder | null>(null);
  const [followups, setFollowups] = useState<ImprovementFollowup[]>([]);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.warning, marginTop: 8 })}>
          期限 {order.dueAt ? formatDateTimeZh(order.dueAt) : '—'} · {order.status}
        </Text>
      </QinCard>
      {followups.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
            {item.actorNameSnapshot} · {item.action}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>{item.note}</Text>
        </QinCard>
      ))}
      {order.status !== 'closed' && order.status !== 'verified' ? (
        <>
          <QinInput label="改善說明" value={note} onChangeText={setNote} multiline />
          <QinButton
            label={photoUri ? '已拍攝改善照片' : '拍攝改善照片'}
            variant="secondary"
            onPress={() => {
              void captureInspectionPhoto({ liveCameraOnly: true })
                .then((uri) => setPhotoUri(uri))
                .catch((err) => setError(err instanceof Error ? err.message : '拍照失敗'));
            }}
          />
          <QinButton
            label="提交改善"
            loading={busy}
            style={{ marginTop: spacing.sm }}
            onPress={() => {
              void (async () => {
                setBusy(true);
                try {
                  await submitImprovementReply(actor, { orderId: order.id, note, photoUri });
                  setNote('');
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : '提交失敗');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
