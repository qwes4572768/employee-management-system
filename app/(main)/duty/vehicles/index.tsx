import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { VEHICLE_ACCESS_TYPE_LABELS, type VehicleAccessType } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listParkingSpacesForActor } from '@/services/parkingSpaceService';
import {
  checkInVehicleForActor,
  checkOutVehicleForActor,
  createVehicleAccessPassForActor,
  listOnSiteVehiclesForActor,
  type OnSiteVehicleView,
} from '@/services/vehicleService';
import { listVisitorPassesForActor } from '@/services/visitorService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { ParkingSpace, VisitorPass } from '@/types';

const ACCESS_OPTIONS = (Object.keys(VEHICLE_ACCESS_TYPE_LABELS) as VehicleAccessType[])
  .filter((value) => value !== 'resident')
  .map((value) => ({ value, label: VEHICLE_ACCESS_TYPE_LABELS[value] }));

export default function DutyVehiclesScreen() {
  const { actor, can, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<OnSiteVehicleView[]>([]);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [visitors, setVisitors] = useState<VisitorPass[]>([]);
  const [plateNo, setPlateNo] = useState('');
  const [accessType, setAccessType] = useState<VehicleAccessType>('visitor');
  const [visitorPassId, setVisitorPassId] = useState('');
  const [parkingSpaceId, setParkingSpaceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!currentSite?.id) return;
    setRows(await listOnSiteVehiclesForActor(actor, currentSite.id));
    if (can('parkingSpace.view')) {
      setSpaces(await listParkingSpacesForActor(actor, { siteId: currentSite.id, status: 'active' }));
    }
    if (can('visitor.view') || can('visitor.check')) {
      const all = await listVisitorPassesForActor(actor, { siteId: currentSite.id });
      setVisitors(all.filter((item) => item.status === 'registered' || item.status === 'checked_in'));
    }
  }, [actor, can, currentSite]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void fn()
      .then(() => load())
      .catch((err) => setError(err instanceof Error ? err.message : '作業失敗'))
      .finally(() => setBusy(false));
  };

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="車牌" value={plateNo} onChangeText={setPlateNo} autoCapitalize="characters" />
      {can('vehicleAccess.register') ? (
        <>
          <QinSelect label="進出類型" value={accessType} options={ACCESS_OPTIONS} onChange={(value) => setAccessType(value as VehicleAccessType)} />
          <QinSelect
            label="連結訪客（選填）"
            value={visitorPassId}
            options={[{ value: '', label: '未連結訪客' }, ...visitors.map((item) => ({ value: item.id, label: `${item.visitorName} · ${item.unitLabelSnapshot}` }))]}
            onChange={setVisitorPassId}
          />
        </>
      ) : null}
      {can('parkingOccupancy.manage') ? (
        <QinSelect
          label="停入車位（選填）"
          value={parkingSpaceId}
          options={[{ value: '', label: '不指定車位' }, ...spaces.map((item) => ({ value: item.id, label: item.displayName }))]}
          onChange={setParkingSpaceId}
        />
      ) : null}
      {can('vehicleAccess.check') ? (
        <>
          <QinButton
            label="進場"
            loading={busy}
            onPress={() =>
              run(async () => {
                if (!currentSite?.id) throw new Error('請先選擇案場');
                let accessPassId: string | null = null;
                if (can('vehicleAccess.register')) {
                  const pass = await createVehicleAccessPassForActor(actor, {
                    siteId: currentSite.id,
                    plateNo,
                    accessType,
                    visitorPassId: visitorPassId || null,
                  });
                  accessPassId = pass.id;
                }
                await checkInVehicleForActor(actor, {
                  siteId: currentSite.id,
                  plateNo,
                  accessPassId,
                  parkingSpaceId: parkingSpaceId || null,
                });
                setPlateNo('');
              })
            }
          />
          <QinButton
            label="離場"
            variant="secondary"
            loading={busy}
            onPress={() =>
              run(async () => {
                if (!currentSite?.id) throw new Error('請先選擇案場');
                await checkOutVehicleForActor(actor, { siteId: currentSite.id, plateNo });
                setPlateNo('');
              })
            }
          />
        </>
      ) : null}
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm })}>
        目前場內車輛
      </Text>
      {rows.length === 0 ? (
        <EmptyState title="目前沒有場內車輛" subtitle="進場後會顯示車牌、訪客與進場時間" icon="car-outline" />
      ) : (
        rows.map((item) => (
          <QinCard key={item.plateNoNormalized} style={{ marginBottom: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>{item.plateNo}</Text>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
              {item.accessType ? VEHICLE_ACCESS_TYPE_LABELS[item.accessType] : '場內'} · {item.stillOnSite ? '目前仍在場' : '已離場'}
            </Text>
            {item.visitorName ? (
              <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
                訪客 {item.visitorName}
                {item.unitLabel ? ` · 訪問 ${item.unitLabel}` : ''}
              </Text>
            ) : null}
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
              進場 {formatDateTimeZh(item.lastInAt)}
            </Text>
          </QinCard>
        ))
      )}
    </Screen>
  );
}
