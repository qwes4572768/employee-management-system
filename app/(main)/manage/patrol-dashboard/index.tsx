import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinCard } from '@/components/ui/QinCard';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useResponsive } from '@/hooks/useResponsive';
import { useSession } from '@/providers/SessionProvider';
import { getPatrolSiteDashboard, listPatrolDashboardTasks } from '@/services/patrolDashboardService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { PatrolSiteDashboard, PatrolTask, PatrolTaskStats } from '@/types';

export default function PatrolDashboardScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const { isTablet } = useResponsive();
  const [dash, setDash] = useState<PatrolSiteDashboard | null>(null);
  const [rows, setRows] = useState<Array<{ task: PatrolTask; userName: string; stats: PatrolTaskStats }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentSite) return;
    setDash(await getPatrolSiteDashboard(actor, currentSite.id));
    setRows(await listPatrolDashboardTasks(actor, currentSite.id));
  }, [actor, currentSite]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const list = (
    <View style={{ flex: 1 }}>
      {rows.map((item) => (
        <ListRow
          key={item.task.id}
          title={`${item.task.templateNameSnapshot} · ${item.userName}`}
          subtitle={`${item.stats.completed} / ${item.stats.totalRequired} · 準時 ${item.stats.onTime} · 逾時 ${item.stats.late} · 漏巡 ${item.stats.missed} · 異常 ${item.stats.exceptions}`}
          onPress={() => router.push({ pathname: '/(main)/manage/patrol-dashboard/[taskId]', params: { taskId: item.task.id } })}
        />
      ))}
    </View>
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {dash ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{dash.siteName}</Text>
          {dash.criticalWarning ? (
            <Text style={textStyle(colors, fontScale, 'md', { color: colors.danger, fontWeight: '800', marginTop: 8 })}>
              {dash.criticalWarning}
            </Text>
          ) : null}
        </QinCard>
      ) : null}
      {dash ? (
        <StatGrid>
          <StatCard label="今日任務" value={String(dash.taskCount)} hint={`執行中 ${dash.activeCount}`} />
          <StatCard label="已完成" value={String(dash.completedCount)} hint={`部分完成 ${dash.partialCount}`} />
          <StatCard label="漏巡任務" value={String(dash.missedTaskCount)} />
          <StatCard label="完成率" value={`${dash.completionRate}%`} hint={`準時 ${dash.onTime} · 逾時 ${dash.late}`} />
          <StatCard label="漏巡點" value={String(dash.missed)} />
          <StatCard label="異常" value={String(dash.exceptions)} />
        </StatGrid>
      ) : (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>請先選擇案場</Text>
      )}
      {isTablet ? <View style={{ flexDirection: 'row' }}>{list}</View> : list}
    </Screen>
  );
}
