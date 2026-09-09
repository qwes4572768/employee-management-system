import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinCard } from '@/components/ui/QinCard';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { useSession } from '@/providers/SessionProvider';
import { getMobilityHomeCard } from '@/services/mobilityDashboardService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { MobilityHomeCard } from '@/types';
import { Text } from 'react-native';

export default function ParkingDashboardScreen() {
  const { actor, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [card, setCard] = useState<MobilityHomeCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentSite?.id) return;
    setCard(await getMobilityHomeCard(actor, currentSite.id));
  }, [actor, currentSite]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinCard style={{ marginBottom: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>目前案場</Text>
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800', marginTop: 6 })}>
          {currentSite?.name ?? '尚未選擇案場'}
        </Text>
      </QinCard>
      <StatGrid>
        <StatCard label="場內車輛" value={String(card?.vehiclesOnSite ?? 0)} hint={`訪客／臨停 ${card?.visitorVehiclesOnSite ?? 0}`} />
        <StatCard
          label="車位占用率"
          value={`${card?.occupancyRate ?? 0}%`}
          hint={`${card?.occupiedSpaces ?? 0} / ${card?.totalActiveSpaces ?? 0}`}
        />
        <StatCard label="占用異常" value={String(card?.openViolations ?? 0)} hint="未結案占用異常" />
        <StatCard label="臨停逾時" value={String(card?.overstayedOccupancies ?? 0)} hint="訪客車位超過上限" />
        <StatCard label="鑰匙借出" value={String(card?.keysCheckedOut ?? 0)} hint={`逾期 ${card?.keysOverdue ?? 0}`} />
        <StatCard label="物品借出" value={String(card?.itemsLoaned ?? 0)} hint={`逾期 ${card?.itemsOverdue ?? 0}`} />
      </StatGrid>
    </Screen>
  );
}
