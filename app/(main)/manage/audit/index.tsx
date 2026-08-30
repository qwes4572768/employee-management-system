import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { QinCard } from '@/components/ui/QinCard';
import { useSession } from '@/providers/SessionProvider';
import { getAuditLogs } from '@/services/auditService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { AuditLog } from '@/types';
import { formatDateTimeZh } from '@/utils/datetime';

export default function AuditScreen() {
  const { actor, tenant } = useSession();
  const { colors, fontScale } = useTheme();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const load = useCallback(async () => {
    if (!tenant) return;
    setLogs(await getAuditLogs(tenant.id, actor));
  }, [tenant, actor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {logs.length === 0 ? (
        <EmptyState title="目前尚無操作紀錄" subtitle="帳號、公司、案場與權限異動都會寫入這裡" icon="document-text-outline" />
      ) : (
        logs.map((log) => (
          <QinCard key={log.id} style={{ marginBottom: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>
              {log.actorNameSnapshot}
            </Text>
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, marginTop: 4 })}>
              {formatDateTimeZh(log.createdAt)}
            </Text>
            <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 8 })}>{log.description}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle })}>
                {log.actorRoleSnapshot} · {log.module}/{log.action}
              </Text>
            </View>
          </QinCard>
        ))
      )}
    </Screen>
  );
}
