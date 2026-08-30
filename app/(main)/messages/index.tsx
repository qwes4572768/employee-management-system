import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { QinCard } from '@/components/ui/QinCard';
import { useSession } from '@/providers/SessionProvider';
import { listNotifications } from '@/repositories/notificationRepository';
import { remindDueReinspections } from '@/services/inspectionService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { AppNotification } from '@/types';

export default function MessagesScreen() {
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [notes, setNotes] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    if (!actor.tenantId || !actor.userId) return;
    await remindDueReinspections(actor.tenantId);
    setNotes(await listNotifications(actor.tenantId, actor.userId));
  }, [actor.tenantId, actor.userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        本機通知，包含督勤複查到期提醒。
      </Text>
      {notes.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textSubtle })}>目前沒有訊息</Text>
      ) : (
        notes.map((item) => (
          <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>{item.title}</Text>
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>{item.body}</Text>
          </QinCard>
        ))
      )}
    </Screen>
  );
}
