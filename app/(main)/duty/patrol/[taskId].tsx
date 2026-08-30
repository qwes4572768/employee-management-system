import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinCard } from '@/components/ui/QinCard';
import { PATROL_POINT_LIVE_LABELS, PATROL_POINT_LIVE_MARKS } from '@/constants/patrol';
import { useSession } from '@/providers/SessionProvider';
import { getPatrolTaskDetail } from '@/services/patrolTaskService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { PatrolPointView, PatrolTask, PatrolTaskStats } from '@/types';

export default function PatrolTaskScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [task, setTask] = useState<PatrolTask | null>(null);
  const [stats, setStats] = useState<PatrolTaskStats | null>(null);
  const [points, setPoints] = useState<PatrolPointView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!taskId) return;
    const detail = await getPatrolTaskDetail(actor, taskId);
    setTask(detail.task);
    setStats(detail.stats);
    setPoints(detail.points);
  }, [actor, taskId]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {task && stats ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{task.templateNameSnapshot}</Text>
          <Text style={textStyle(colors, fontScale, 'lg', { color: colors.accent, marginTop: 6 })}>
            {stats.completed} / {stats.totalRequired} · {stats.completionRate}%
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>
            準時 {stats.onTime} · 逾時 {stats.late} · 漏巡 {stats.missed}
          </Text>
        </QinCard>
      ) : null}
      {points.map((point) => (
        <ListRow
          key={point.id}
          title={`${PATROL_POINT_LIVE_MARKS[point.liveStatus]} ${point.pointNameSnapshot}`}
          subtitle={`${point.windowLabel} · ${PATROL_POINT_LIVE_LABELS[point.liveStatus]}${point.completedAtLabel ? ` · ${point.completedAtLabel}` : ''}`}
          meta={[point.requireQr ? '需 QR' : null, point.requireGps ? '需 GPS' : null, point.requirePhoto ? '需照片' : null]
            .filter(Boolean)
            .join(' · ')}
          onPress={() =>
            router.push({
              pathname: '/(main)/duty/patrol/check',
              params: { pointId: point.id },
            })
          }
        />
      ))}
    </Screen>
  );
}
