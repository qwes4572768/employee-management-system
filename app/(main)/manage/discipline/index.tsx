import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { useSession } from '@/providers/SessionProvider';
import { listDisciplineForActor } from '@/services/disciplineService';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';
import type { DisciplinaryRecommendation } from '@/types';

export default function DisciplineListScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<DisciplinaryRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void listDisciplineForActor(actor, { siteId: currentSite?.id ?? null })
        .then(setRows)
        .catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [actor, currentSite?.id]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.warning, marginBottom: 8 })}>
        此處僅審核懲處 / 賠償建議，不會直接產生薪資扣款。
      </Text>
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>目前沒有懲處建議</Text>
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={`${item.actionLabelSnapshot} · ${item.status}`}
            subtitle={item.reason}
            onPress={() => router.push({ pathname: '/(main)/manage/discipline/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
