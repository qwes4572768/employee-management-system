import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinCard } from '@/components/ui/QinCard';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useSession } from '@/providers/SessionProvider';
import { getInspectionSiteDashboard } from '@/services/inspectionDashboardService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { InspectionSiteDashboard } from '@/types';

export default function InspectionDashboardScreen() {
  const { actor, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [dash, setDash] = useState<InspectionSiteDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!currentSite) return;
      void getInspectionSiteDashboard(actor, currentSite.id)
        .then(setDash)
        .catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [actor, currentSite]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {dash ? (
        <>
          <QinCard style={{ marginBottom: spacing.md }}>
            <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{dash.siteName}</Text>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>今日督勤戰情</Text>
          </QinCard>
          <StatGrid>
            <StatCard label="今日督勤人次" value={String(dash.todayCount)} hint={`平均 ${dash.averageScore ?? '—'} 分`} />
            <StatCard label="不合格" value={String(dash.failCount)} />
            <StatCard label="重大缺失" value={String(dash.majorCount)} />
            <StatCard label="待改善" value={String(dash.openImprovements)} />
            <StatCard label="逾期改善" value={String(dash.overdueImprovements)} />
            <StatCard label="待懲處審核" value={String(dash.pendingDiscipline)} />
          </StatGrid>
        </>
      ) : (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>請先選擇案場</Text>
      )}
    </Screen>
  );
}
