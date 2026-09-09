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
  RESIDENT_VEHICLE_STATUS_LABELS,
  RESIDENT_VEHICLE_TYPE_LABELS,
  type ResidentVehicleStatus,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { getResidentVehicleForActor, updateResidentVehicleForActor } from '@/services/vehicleService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { ResidentVehicle } from '@/types';

const STATUS_OPTIONS = (Object.keys(RESIDENT_VEHICLE_STATUS_LABELS) as ResidentVehicleStatus[]).map((value) => ({
  value,
  label: RESIDENT_VEHICLE_STATUS_LABELS[value],
}));

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [vehicle, setVehicle] = useState<ResidentVehicle | null>(null);
  const [status, setStatus] = useState<ResidentVehicleStatus>('active');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const current = await getResidentVehicleForActor(actor, id);
    setVehicle(current);
    setStatus(current.status);
    setNotes(current.notes ?? '');
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {vehicle ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{vehicle.plateNo}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {RESIDENT_VEHICLE_TYPE_LABELS[vehicle.vehicleType]} · {RESIDENT_VEHICLE_STATUS_LABELS[vehicle.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
            正規化車牌 {vehicle.plateNoNormalized}
          </Text>
        </QinCard>
      ) : null}
      {vehicle && can('vehicle.manage') ? (
        <>
          <QinSelect label="狀態" value={status} options={STATUS_OPTIONS} onChange={(value) => setStatus(value as ResidentVehicleStatus)} />
          <QinInput label="備註" value={notes} onChangeText={setNotes} multiline />
          <QinButton
            label="儲存"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void updateResidentVehicleForActor(actor, vehicle.id, { status, notes })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '儲存失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
