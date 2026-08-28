import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ListRow } from '@/components/ui/ListRow';
import { LEAVE_TYPE_LABELS } from '@/constants/leave';
import { useSession } from '@/providers/SessionProvider';
import { getUserById } from '@/repositories/userRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { listLeaveForReview, staffingImpactIfApproved } from '@/services/leaveService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { LeaveRequest } from '@/types';

export default function LeaveReviewListScreen() {
  const router = useRouter();
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<Array<{ request: LeaveRequest; name: string; siteName: string; shortage: number }>>([]);

  const load = useCallback(async () => {
    const list = await listLeaveForReview(actor);
    const mapped = [];
    for (const request of list) {
      const user = await getUserById(request.userId, actor.tenantId ?? undefined);
      const site = request.siteId ? await getSiteById(request.siteId, actor.tenantId ?? undefined) : null;
      const impact = await staffingImpactIfApproved(request);
      mapped.push({
        request,
        name: user?.fullName ?? request.userId,
        siteName: site?.name ?? '—',
        shortage: impact.impacts.reduce((sum, item) => sum + item.shortage, 0),
      });
    }
    setRows(mapped);
  }, [actor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>待我審核</Text>
      {rows.map(({ request, name, siteName, shortage }) => (
        <ListRow
          key={request.id}
          title={name}
          subtitle={`${LEAVE_TYPE_LABELS[request.leaveType]} · ${request.startDate}～${request.endDate} · ${request.days}日 · ${siteName}${request.isUrgent ? ' · 急件' : ''}${request.documentStatus === 'overdue' ? ' · 逾期補件' : ''}${shortage ? ` · 缺員${shortage}` : ''}`}
          onPress={() => router.push({ pathname: '/(main)/manage/leave-review/[id]', params: { id: request.id } })}
        />
      ))}
    </Screen>
  );
}
