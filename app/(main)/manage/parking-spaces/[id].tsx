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
  PARKING_ASSIGNMENT_TYPE_LABELS,
  PARKING_SPACE_STATUS_LABELS,
  PARKING_SPACE_TYPE_LABELS,
  type ParkingAssignmentType,
  type ParkingSpaceStatus,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import {
  addParkingAssignmentForActor,
  endParkingAssignmentForActor,
  getParkingSettingsForActor,
  getParkingSpaceForActor,
  listParkingAssignmentsForActor,
  updateParkingSettingsForActor,
  updateParkingSpaceForActor,
} from '@/services/parkingSpaceService';
import { listSiteUnitsForActor } from '@/services/unitService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { ParkingAssignment, ParkingSpace, SiteParkingSettings, SiteUnit } from '@/types';

const STATUS_OPTIONS = (Object.keys(PARKING_SPACE_STATUS_LABELS) as ParkingSpaceStatus[]).map((value) => ({
  value,
  label: PARKING_SPACE_STATUS_LABELS[value],
}));
const ASSIGN_OPTIONS = (Object.keys(PARKING_ASSIGNMENT_TYPE_LABELS) as ParkingAssignmentType[]).map((value) => ({
  value,
  label: PARKING_ASSIGNMENT_TYPE_LABELS[value],
}));

export default function ParkingSpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [space, setSpace] = useState<ParkingSpace | null>(null);
  const [assignments, setAssignments] = useState<ParkingAssignment[]>([]);
  const [units, setUnits] = useState<SiteUnit[]>([]);
  const [settings, setSettings] = useState<SiteParkingSettings | null>(null);
  const [status, setStatus] = useState<ParkingSpaceStatus>('active');
  const [notes, setNotes] = useState('');
  const [unitId, setUnitId] = useState('');
  const [assignmentType, setAssignmentType] = useState<ParkingAssignmentType>('owned');
  const [visitorMax, setVisitorMax] = useState('120');
  const [tempMax, setTempMax] = useState('120');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const current = await getParkingSpaceForActor(actor, id);
    setSpace(current);
    setStatus(current.status);
    setNotes(current.notes ?? '');
    setAssignments(await listParkingAssignmentsForActor(actor, current.id));
    setUnits(await listSiteUnitsForActor(actor, current.siteId));
    const parking = await getParkingSettingsForActor(actor, current.siteId);
    setSettings(parking);
    setVisitorMax(String(parking.visitorMaxDurationMinutes));
    setTempMax(String(parking.temporaryMaxDurationMinutes));
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {space ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{space.displayName}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
            {PARKING_SPACE_TYPE_LABELS[space.spaceType]} · {PARKING_SPACE_STATUS_LABELS[space.status]}
          </Text>
        </QinCard>
      ) : null}
      {space && can('parkingSpace.manage') ? (
        <>
          <QinSelect label="狀態" value={status} options={STATUS_OPTIONS} onChange={(value) => setStatus(value as ParkingSpaceStatus)} />
          <QinInput label="備註" value={notes} onChangeText={setNotes} multiline />
          <QinButton
            label="儲存車位"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void updateParkingSpaceForActor(actor, space.id, { status, notes })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '儲存失敗'))
                .finally(() => setBusy(false));
            }}
          />
          <QinInput label="訪客臨停上限（分鐘）" value={visitorMax} onChangeText={setVisitorMax} keyboardType="number-pad" />
          <QinInput label="臨時車位上限（分鐘）" value={tempMax} onChangeText={setTempMax} keyboardType="number-pad" />
          <QinButton
            label="儲存臨停設定"
            variant="secondary"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void updateParkingSettingsForActor(actor, space.siteId, {
                visitorMaxDurationMinutes: Number(visitorMax),
                temporaryMaxDurationMinutes: Number(tempMax),
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '儲存失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : settings ? (
        <Text style={textStyle(colors, fontScale, 'sm', { marginBottom: spacing.md })}>
          訪客臨停上限 {settings.visitorMaxDurationMinutes} 分鐘
        </Text>
      ) : null}
      {space && can('parkingAssignment.manage') ? (
        <>
          <QinSelect
            label="指派戶別（選填）"
            value={unitId}
            options={[{ value: '', label: '未指定戶別' }, ...units.map((item) => ({ value: item.id, label: item.displayName }))]}
            onChange={setUnitId}
          />
          <QinSelect
            label="關係類型"
            value={assignmentType}
            options={ASSIGN_OPTIONS}
            onChange={(value) => setAssignmentType(value as ParkingAssignmentType)}
          />
          <QinButton
            label="新增車位指派"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void addParkingAssignmentForActor(actor, {
                parkingSpaceId: space.id,
                unitId: unitId || null,
                assignmentType,
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '指派失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm })}>
        指派歷史（不會覆蓋）
      </Text>
      {assignments.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>
            {PARKING_ASSIGNMENT_TYPE_LABELS[item.assignmentType]} · {item.isCurrent ? '目前有效' : '歷史'}
          </Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
            {item.startsAt ? formatDateTimeZh(item.startsAt) : '—'}
            {item.endsAt ? ` ～ ${formatDateTimeZh(item.endsAt)}` : ' ～'}
          </Text>
          {item.isCurrent && can('parkingAssignment.manage') ? (
            <QinButton
              label="結束此指派"
              variant="ghost"
              onPress={() => {
                setBusy(true);
                void endParkingAssignmentForActor(actor, item.id, { reason: '結束車位指派' })
                  .then(() => load())
                  .catch((err) => setError(err instanceof Error ? err.message : '結束失敗'))
                  .finally(() => setBusy(false));
              }}
            />
          ) : null}
        </QinCard>
      ))}
    </Screen>
  );
}
