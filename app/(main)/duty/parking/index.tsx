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
import {
  PARKING_OCCUPANCY_STATUS_LABELS,
  PARKING_SPACE_TYPE_LABELS,
  PARKING_VIOLATION_TYPE_LABELS,
  type ParkingViolationType,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listParkingAssignmentsForActor, listParkingSpacesForActor } from '@/services/parkingSpaceService';
import {
  createParkingViolationForActor,
  listParkingOccupanciesForActor,
  occupyParkingSpaceForActor,
  releaseParkingOccupancyForActor,
} from '@/services/vehicleService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { ParkingAssignment, ParkingOccupancy, ParkingSpace } from '@/types';

const VIOLATION_OPTIONS = (Object.keys(PARKING_VIOLATION_TYPE_LABELS) as ParkingViolationType[]).map((value) => ({
  value,
  label: PARKING_VIOLATION_TYPE_LABELS[value],
}));

export default function DutyParkingScreen() {
  const { actor, can, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [occupancies, setOccupancies] = useState<ParkingOccupancy[]>([]);
  const [assignments, setAssignments] = useState<ParkingAssignment[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [violationType, setViolationType] = useState<ParkingViolationType>('unauthorized_space');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await listParkingSpacesForActor(actor, { siteId: currentSite?.id ?? null, status: 'active' });
    setSpaces(list);
    setSpaceId((current) => current || list[0]?.id || '');
    setOccupancies(await listParkingOccupanciesForActor(actor, currentSite?.id ?? null, true));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!spaceId || !can('parkingAssignment.view')) {
        setAssignments([]);
        return;
      }
      void listParkingAssignmentsForActor(actor, spaceId)
        .then((rows) => setAssignments(rows.filter((item) => item.isCurrent)))
        .catch((err) => setError(err instanceof Error ? err.message : '讀取指派失敗'));
    }, [actor, can, spaceId]),
  );

  const selected = spaces.find((item) => item.id === spaceId);
  const occupancy = occupancies.find((item) => item.parkingSpaceId === spaceId);

  return (
    <Screen>
      <ErrorBanner message={error} />
      {spaces.length === 0 ? (
        <EmptyState title="尚未建立車位" subtitle="請由管理中心先建立車位主檔" icon="grid-outline" />
      ) : (
        <>
          <QinSelect
            label="車位"
            value={spaceId}
            options={spaces.map((item) => ({ value: item.id, label: `${item.displayName} · ${PARKING_SPACE_TYPE_LABELS[item.spaceType]}` }))}
            onChange={setSpaceId}
          />
          {selected ? (
            <QinCard style={{ marginBottom: spacing.md }}>
              <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>{selected.displayName}</Text>
              <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
                {PARKING_SPACE_TYPE_LABELS[selected.spaceType]} · 有權使用 {assignments.length} 筆
              </Text>
              <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
                實際占用：{occupancy ? `${occupancy.plateNoSnapshot}（${PARKING_OCCUPANCY_STATUS_LABELS[occupancy.status]}）` : '空位'}
              </Text>
            </QinCard>
          ) : null}
          <QinInput label="車牌" value={plateNo} onChangeText={setPlateNo} autoCapitalize="characters" />
          {can('parkingOccupancy.manage') ? (
            <>
              <QinButton
                label="登記占用"
                loading={busy}
                onPress={() => {
                  setBusy(true);
                  void occupyParkingSpaceForActor(actor, { parkingSpaceId: spaceId, plateNo })
                    .then(() => load())
                    .catch((err) => setError(err instanceof Error ? err.message : '登記失敗'))
                    .finally(() => setBusy(false));
                }}
              />
              {occupancy ? (
                <QinButton
                  label="解除占用"
                  variant="secondary"
                  loading={busy}
                  onPress={() => {
                    setBusy(true);
                    void releaseParkingOccupancyForActor(actor, occupancy.id)
                      .then(() => load())
                      .catch((err) => setError(err instanceof Error ? err.message : '解除失敗'))
                      .finally(() => setBusy(false));
                  }}
                />
              ) : null}
            </>
          ) : null}
          {can('parkingViolation.create') ? (
            <>
              <QinSelect
                label="異常類型"
                value={violationType}
                options={VIOLATION_OPTIONS}
                onChange={(value) => setViolationType(value as ParkingViolationType)}
              />
              <QinInput label="說明" value={description} onChangeText={setDescription} multiline />
              <QinButton
                label="登記占用異常"
                variant="secondary"
                loading={busy}
                onPress={() => {
                  if (!currentSite?.id) return;
                  setBusy(true);
                  void createParkingViolationForActor(actor, {
                    siteId: currentSite.id,
                    parkingSpaceId: spaceId,
                    plateNo,
                    violationType,
                    description,
                  })
                    .then(() => {
                      setDescription('');
                      return load();
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : '登記失敗'))
                    .finally(() => setBusy(false));
                }}
              />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
