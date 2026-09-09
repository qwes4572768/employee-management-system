import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinSelect } from '@/components/ui/QinSelect';
import { OCCUPANCY_TYPE_LABELS, RESIDENT_RELATION_LABELS, UNIT_STATUS_LABELS, type OccupancyType, type UnitStatus } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listUnitOccupanciesForActor } from '@/services/residentService';
import { getSiteUnitForActor, updateSiteUnitForActor } from '@/services/unitService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Resident, ResidentOccupancy, SiteUnit } from '@/types';

const OCCUPANCY_OPTIONS = (Object.keys(OCCUPANCY_TYPE_LABELS) as OccupancyType[]).map((value) => ({
  value,
  label: OCCUPANCY_TYPE_LABELS[value],
}));
const STATUS_OPTIONS = (Object.keys(UNIT_STATUS_LABELS) as UnitStatus[]).map((value) => ({
  value,
  label: UNIT_STATUS_LABELS[value],
}));

export default function UnitDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [unit, setUnit] = useState<SiteUnit | null>(null);
  const [rows, setRows] = useState<Array<{ occupancy: ResidentOccupancy; resident: Resident | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const item = await getSiteUnitForActor(actor, id);
    setUnit(item);
    setRows(await listUnitOccupanciesForActor(actor, id, true));
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {unit ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{unit.displayName}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>
            {OCCUPANCY_TYPE_LABELS[unit.occupancyType]} · {UNIT_STATUS_LABELS[unit.status]}
          </Text>
          {unit.notes ? (
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 8 })}>{unit.notes}</Text>
          ) : null}
        </QinCard>
      ) : null}
      {can('unit.manage') && unit ? (
        <>
          <QinSelect
            label="現況"
            value={unit.occupancyType}
            options={OCCUPANCY_OPTIONS}
            onChange={(value) => {
              setBusy(true);
              void updateSiteUnitForActor(actor, unit.id, { occupancyType: value })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '更新失敗'))
                .finally(() => setBusy(false));
            }}
          />
          <QinSelect
            label="狀態"
            value={unit.status}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setBusy(true);
              void updateSiteUnitForActor(actor, unit.id, { status: value })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '更新失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      {can('resident.manage') && unit ? (
        <QinButton
          label="新增住戶"
          loading={busy}
          onPress={() => router.push({ pathname: '/(main)/manage/residents/new', params: { unitId: unit.id } })}
        />
      ) : null}
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm })}>
        目前關係
      </Text>
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textSubtle })}>此戶尚無住戶關係</Text>
      ) : (
        rows.map((row) => (
          <ListRow
            key={row.occupancy.id}
            title={row.resident?.fullName ?? '未知住戶'}
            subtitle={RESIDENT_RELATION_LABELS[row.occupancy.relationKey]}
            meta={row.resident?.phone ?? undefined}
            onPress={
              row.resident
                ? () => router.push({ pathname: '/(main)/manage/residents/[id]', params: { id: row.resident!.id } })
                : undefined
            }
          />
        ))
      )}
    </Screen>
  );
}
