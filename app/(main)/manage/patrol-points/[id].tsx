import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QrCodeView } from '@/components/qr/QrCodeView';
import { useSession } from '@/providers/SessionProvider';
import { deactivatePatrolPointByActor, getPatrolPointForActor } from '@/services/patrolPointService';
import { getActiveQrAssetForTarget } from '@/repositories/qrAssetRepository';
import { issuePatrolPointQr } from '@/services/qrAssetService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { PatrolPoint, QrAsset } from '@/types';

export default function PatrolPointDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [point, setPoint] = useState<PatrolPoint | null>(null);
  const [qr, setQr] = useState<QrAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const item = await getPatrolPointForActor(actor, id);
    setPoint(item);
    setQr(actor.tenantId ? await getActiveQrAssetForTarget(actor.tenantId, 'patrol_point', item.id) : null);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {point ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{point.name}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>
            {point.code} · {point.status === 'active' ? '啟用' : '停用'}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>
            QR {point.requireQr ? '必要' : '否'} · GPS {point.requireGps ? '必要' : '否'} · 照片 {point.requirePhoto ? '必要' : '否'}
          </Text>
        </QinCard>
      ) : null}
      {qr ? <QrCodeView value={qr.qrCode} caption="巡邏點永久 QR" /> : null}
      {can('qrAsset.create') && point ? (
        <QinButton
          label={qr ? '重新產生巡邏點 QR' : '建立巡邏點 QR'}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void issuePatrolPointQr(actor, point.id, Boolean(qr))
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      {can('patrolPoint.manage') && point?.status === 'active' ? (
        <QinButton
          label="停用巡邏點"
          variant="secondary"
          onPress={() => {
            if (!id) return;
            void deactivatePatrolPointByActor(actor, id)
              .then(() => router.back())
              .catch((err) => setError(err instanceof Error ? err.message : '停用失敗'));
          }}
        />
      ) : null}
    </Screen>
  );
}
