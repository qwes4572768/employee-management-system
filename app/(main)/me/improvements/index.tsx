import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { useSession } from '@/providers/SessionProvider';
import { listImprovementsForActor } from '@/services/improvementService';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { ImprovementOrder } from '@/types';

export default function MyImprovementsScreen() {
  const router = useRouter();
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<ImprovementOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void listImprovementsForActor(actor, { employeeUserId: actor.userId })
        .then(setRows)
        .catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [actor]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>目前沒有改善事項</Text>
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.title}
            subtitle={`${item.status} · 期限 ${item.dueAt ? formatDateTimeZh(item.dueAt) : '—'}`}
            onPress={() => router.push({ pathname: '/(main)/me/improvements/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
