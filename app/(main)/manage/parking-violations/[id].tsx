import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import {
  PARKING_VIOLATION_SEVERITY_LABELS,
  PARKING_VIOLATION_STATUS_LABELS,
  PARKING_VIOLATION_TYPE_LABELS,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listParkingViolationsForActor, resolveParkingViolationForActor } from '@/services/vehicleService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { ParkingViolation } from '@/types';

export default function ParkingViolationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [item, setItem] = useState<ParkingViolation | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await listParkingViolationsForActor(actor, currentSite?.id ?? null);
    setItem(rows.find((row) => row.id === id) ?? null);
  }, [actor, currentSite?.id, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {item ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{item.plateNoSnapshot}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {PARKING_VIOLATION_TYPE_LABELS[item.violationType]} · {PARKING_VIOLATION_SEVERITY_LABELS[item.severity]} ·{' '}
            {PARKING_VIOLATION_STATUS_LABELS[item.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>{item.description ?? '未填說明'}</Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 6 })}>
            通報時間 {formatDateTimeZh(item.reportedAt)}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: 8 })}>
            本階段只建立管理紀錄，不會自動罰款、扣款或扣薪。
          </Text>
        </QinCard>
      ) : null}
      {item && item.status !== 'resolved' && item.status !== 'voided' && can('parkingViolation.manage') ? (
        <>
          <QinInput label="結案說明" value={note} onChangeText={setNote} multiline />
          <QinButton
            label="結案"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void resolveParkingViolationForActor(actor, item.id, { status: 'resolved', resolutionNote: note })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '結案失敗'))
                .finally(() => setBusy(false));
            }}
          />
          <QinButton
            label="作廢"
            variant="secondary"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void resolveParkingViolationForActor(actor, item.id, { status: 'voided', resolutionNote: note })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '作廢失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
