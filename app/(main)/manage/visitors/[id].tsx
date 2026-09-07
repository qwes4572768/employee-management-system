import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { VISITOR_KIND_LABELS, VISITOR_PASS_STATUS_LABELS } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { cancelVisitorPass, getVisitorPassForActor } from '@/services/visitorService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { VisitorMovement, VisitorPass } from '@/types';

export default function ManageVisitorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [pass, setPass] = useState<VisitorPass | null>(null);
  const [movements, setMovements] = useState<VisitorMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getVisitorPassForActor(actor, id);
    setPass(detail.pass);
    setMovements(detail.movements);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {pass ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{pass.visitorName}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {VISITOR_KIND_LABELS[pass.visitorKind]} · {VISITOR_PASS_STATUS_LABELS[pass.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>
            {pass.unitLabelSnapshot} · 受訪 {pass.hostNameSnapshot}
          </Text>
          {pass.visitorCompany ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>單位 {pass.visitorCompany}</Text>
          ) : null}
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: 8 })}>
            登記時間 {formatDateTimeZh(pass.createdAt)} · 裝置時間 {formatDateTimeZh(pass.deviceTime)}
          </Text>
        </QinCard>
      ) : null}
      {movements.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '700' })}>
            {item.direction === 'in' ? '進場' : '離場'} · {formatDateTimeZh(item.occurredAt)}
          </Text>
          {item.note ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>{item.note}</Text>
          ) : null}
          {item.photoUri ? (
            <Image source={{ uri: item.photoUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginTop: 8 }} />
          ) : null}
        </QinCard>
      ))}
      {can('visitor.cancel') && pass && pass.status !== 'cancelled' && pass.status !== 'checked_in' ? (
        <QinButton
          label="取消登記"
          variant="danger"
          loading={busy}
          onPress={() => {
            if (!id) return;
            setBusy(true);
            void cancelVisitorPass(actor, id)
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : '取消失敗'))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </Screen>
  );
}
