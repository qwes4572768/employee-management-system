import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { useSession } from '@/providers/SessionProvider';
import { getShiftTemplates } from '@/services/scheduleService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { ShiftTemplate } from '@/types';

export default function ShiftListScreen() {
  const router = useRouter();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<ShiftTemplate[]>([]);

  const load = useCallback(async () => {
    setRows(await getShiftTemplates(actor));
  }, [actor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {can('schedule.create') ? (
        <QinButton label="新增班別" onPress={() => router.push('/(main)/manage/shifts/new')} />
      ) : null}
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md })}>
          尚未建立班別
        </Text>
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            subtitle={`${item.code} · ${item.startTime}～${item.endTime}${item.crossesMidnight ? '（跨日）' : ''} · ${item.plannedMinutes} 分`}
            meta={item.status === 'active' ? '啟用' : '停用'}
          />
        ))
      )}
    </Screen>
  );
}
