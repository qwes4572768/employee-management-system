import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinSelect } from '@/components/ui/QinSelect';
import { GENDER_LABELS } from '@/constants/app';
import { RESIDENT_RELATION_LABELS, RESIDENT_STATUS_LABELS, type ResidentRelationKey } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import {
  addResidentOccupancyForActor,
  endResidentOccupancyForActor,
  getResidentForActor,
} from '@/services/residentService';
import { listSiteUnitsForActor } from '@/services/unitService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { Resident, ResidentOccupancy, SiteUnit } from '@/types';

const RELATION_OPTIONS = (Object.keys(RESIDENT_RELATION_LABELS) as ResidentRelationKey[]).map((value) => ({
  value,
  label: RESIDENT_RELATION_LABELS[value],
}));

export default function ResidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [resident, setResident] = useState<Resident | null>(null);
  const [occupancies, setOccupancies] = useState<ResidentOccupancy[]>([]);
  const [units, setUnits] = useState<SiteUnit[]>([]);
  const [unitId, setUnitId] = useState('');
  const [relationKey, setRelationKey] = useState<ResidentRelationKey>('tenant');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getResidentForActor(actor, id);
    setResident(detail.resident);
    setOccupancies(detail.occupancies);
    const siteUnits = await listSiteUnitsForActor(actor, currentSite?.id ?? detail.resident.siteId);
    setUnits(siteUnits);
    setUnitId((current) => current || detail.resident.unitId || siteUnits[0]?.id || '');
  }, [actor, currentSite?.id, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {resident ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{resident.fullName}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>
            {GENDER_LABELS[resident.gender] ?? resident.gender} · {RESIDENT_STATUS_LABELS[resident.status]}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 6 })}>
            {resident.phone ?? '未留電話'}
            {resident.idLast4 ? ` · 末四碼 ${resident.idLast4}` : ''}
          </Text>
        </QinCard>
      ) : null}
      {can('resident.manage') && resident ? (
        <>
          <QinSelect
            label="新增關係戶別"
            value={unitId}
            options={units.map((item) => ({ value: item.id, label: item.displayName }))}
            onChange={setUnitId}
          />
          <QinSelect label="關係" value={relationKey} options={RELATION_OPTIONS} onChange={setRelationKey} />
          <QinButton
            label="新增所有人／租戶關係"
            loading={busy}
            onPress={() => {
              if (!id) return;
              setBusy(true);
              void addResidentOccupancyForActor(actor, { residentId: id, unitId, relationKey })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '新增失敗'))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm })}>
        關係紀錄
      </Text>
      {occupancies.map((item) => {
        const unit = units.find((row) => row.id === item.unitId);
        return (
          <ListRow
            key={item.id}
            title={`${item.relationLabelSnapshot}${unit ? ` · ${unit.displayName}` : ''}`}
            subtitle={item.isCurrent ? '目前有效' : `已結束 ${item.endsAt ? formatDateTimeZh(item.endsAt) : ''}`}
            meta={item.startsAt ? formatDateTimeZh(item.startsAt) : undefined}
            onPress={
              can('resident.manage') && item.isCurrent
                ? () => {
                    void endResidentOccupancyForActor(actor, item.id)
                      .then(() => load())
                      .catch((err) => setError(err instanceof Error ? err.message : '結束失敗'));
                  }
                : undefined
            }
          />
        );
      })}
      {can('resident.manage') ? (
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: spacing.sm })}>
          點選目前有效的關係即可結束，歷史關係會保留。
        </Text>
      ) : null}
    </Screen>
  );
}
