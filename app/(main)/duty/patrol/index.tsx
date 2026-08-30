import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinCard } from '@/components/ui/QinCard';
import { useSession } from '@/providers/SessionProvider';
import { getOwnActivePatrolCard, listOwnPatrolTasks } from '@/services/patrolTaskService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { PatrolHomeCard, PatrolTask } from '@/types';

export default function PatrolHomeScreen() {
  const router = useRouter();
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [card, setCard] = useState<PatrolHomeCard | null>(null);
  const [tasks, setTasks] = useState<PatrolTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCard(await getOwnActivePatrolCard(actor));
    setTasks(await listOwnPatrolTasks(actor));
  }, [actor]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {card?.task ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent })}>
            {card.task.templateNameSnapshot}
          </Text>
          <Text style={textStyle(colors, fontScale, 'hero', { fontWeight: '800', marginTop: 8 })}>
            {card.stats.completed} / {card.stats.totalRequired}
          </Text>
          <Text style={textStyle(colors, fontScale, 'lg', { color: colors.electric, marginTop: 4 })}>
            完成率 {card.stats.completionRate}%
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 8 })}>
            準時 {card.stats.onTime} · 逾時 {card.stats.late} · 漏巡 {card.stats.missed}
          </Text>
          {card.nextPoint ? (
            <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800', marginTop: spacing.md })}>
              下一巡邏：{card.nextPoint.pointNameSnapshot}
            </Text>
          ) : null}
          {card.nextPoint ? (
            <Text style={textStyle(colors, fontScale, 'md', { color: colors.warning, marginTop: 4 })}>
              時間 {card.nextPoint.windowLabel}
              {card.minutesUntilNext != null ? ` · 距離可開始 ${card.minutesUntilNext} 分鐘` : ''}
            </Text>
          ) : null}
        </QinCard>
      ) : (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>
            目前沒有巡邏任務。請先開始勤務，且案場需有符合的巡邏模板。
          </Text>
        </QinCard>
      )}
      {tasks.map((task) => (
        <ListRow
          key={task.id}
          title={task.templateNameSnapshot}
          subtitle={`${task.siteNameSnapshot} · ${task.completedPoints}/${task.totalPoints} · ${task.completionRate}%`}
          onPress={() => router.push({ pathname: '/(main)/duty/patrol/[taskId]', params: { taskId: task.id } })}
        />
      ))}
    </Screen>
  );
}
