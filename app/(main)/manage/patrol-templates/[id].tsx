import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useSession } from '@/providers/SessionProvider';
import { listPatrolPointsForActor } from '@/services/patrolPointService';
import { addPatrolTemplatePoint, getPatrolTemplateDetail, updatePatrolTemplateByActor } from '@/services/patrolTemplateService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { PatrolPoint, PatrolTemplate, PatrolTemplatePoint } from '@/types';

export default function PatrolTemplateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [template, setTemplate] = useState<PatrolTemplate | null>(null);
  const [points, setPoints] = useState<PatrolTemplatePoint[]>([]);
  const [available, setAvailable] = useState<PatrolPoint[]>([]);
  const [pointId, setPointId] = useState('');
  const [sequence, setSequence] = useState('1');
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('22:30');
  const [grace, setGrace] = useState('0');
  const [critical, setCritical] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getPatrolTemplateDetail(actor, id);
    setTemplate(detail.template);
    setPoints(detail.points);
    setAvailable(await listPatrolPointsForActor(actor, detail.template.siteId));
    setSequence(String(detail.points.length + 1));
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {template ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{template.name}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>
            {template.description ?? '—'} · {template.status}
          </Text>
        </QinCard>
      ) : null}
      {points.map((item) => (
        <ListRow
          key={item.id}
          title={`${item.sequenceNo}. ${available.find((point) => point.id === item.patrolPointId)?.name ?? item.patrolPointId}`}
          subtitle={`${item.windowStartTime}～${item.windowEndTime}${item.isCritical ? ' · 重點' : ''}`}
        />
      ))}
      {can('patrolTemplate.manage') && template?.status === 'active' ? (
        <>
          <QinSelect
            label="加入巡邏點"
            value={pointId}
            options={available.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setPointId}
          />
          <QinInput label="順序" value={sequence} onChangeText={setSequence} keyboardType="number-pad" />
          <QinInput label="開始 HH:mm" value={start} onChangeText={setStart} />
          <QinInput label="結束 HH:mm" value={end} onChangeText={setEnd} />
          <QinInput label="寬限分鐘" value={grace} onChangeText={setGrace} keyboardType="number-pad" />
          <SwitchRow label="重點巡邏點" value={critical} onValueChange={setCritical} />
          <QinButton
            label="加入模板"
            onPress={() => {
              if (!id) return;
              void addPatrolTemplatePoint(actor, {
                templateId: id,
                patrolPointId: pointId,
                sequenceNo: Number(sequence),
                windowStartTime: start,
                windowEndTime: end,
                graceMinutes: Number(grace) || 0,
                isCritical: critical,
              })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '加入失敗'));
            }}
          />
          <QinButton
            label="停用模板"
            variant="secondary"
            onPress={() => {
              if (!id) return;
              void updatePatrolTemplateByActor(actor, id, { status: 'inactive' })
                .then(() => load())
                .catch((err) => setError(err instanceof Error ? err.message : '停用失敗'));
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
