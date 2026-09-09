import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { LEAVE_TYPE_LABELS } from '@/constants/leave';
import { useSession } from '@/providers/SessionProvider';
import { listOwnLeave, refreshLeaveBalances } from '@/services/leaveService';
import { getLeaveBalance } from '@/repositories/leaveRepository';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { LeaveBalance, LeaveRequest } from '@/types';

export default function MyLeaveScreen() {
  const router = useRouter();
  const { actor, tenant } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [annual, setAnnual] = useState<LeaveBalance | null>(null);
  const [personal, setPersonal] = useState<LeaveBalance | null>(null);

  const load = useCallback(async () => {
    if (!tenant || !actor.userId) return;
    await refreshLeaveBalances(tenant.id, actor.userId);
    setRows(await listOwnLeave(actor));
    const year = `${new Date().getFullYear()}-01-01`;
    setAnnual(await getLeaveBalance(tenant.id, actor.userId, 'annual_leave', year));
    setPersonal(await getLeaveBalance(tenant.id, actor.userId, 'personal_leave', year));
  }, [actor, tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const monthOff = rows.filter((item) => item.leaveType === 'preferred_day_off' && item.startDate.slice(0, 7) === new Date().toISOString().slice(0, 7) && (item.status === 'pending' || item.status === 'approved'));

  return (
    <Screen>
      <QinCard style={{ marginBottom: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'sm')}>本月指定休：{monthOff.length} / 2</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
          特休剩餘 {annual?.remainingDays ?? 0} 日 · 事假剩餘 {personal?.remainingDays ?? 0} 日
        </Text>
      </QinCard>
      <QinButton label="新增申請" onPress={() => router.push('/(main)/duty/leave-new')} />
      {rows.map((item) => (
        <ListRow
          key={item.id}
          title={LEAVE_TYPE_LABELS[item.leaveType]}
          subtitle={`${item.startDate}～${item.endDate} · ${item.days}日 · ${item.status}${item.isUrgent ? ' · 急件' : ''}`}
          onPress={() => router.push({ pathname: '/(main)/duty/leave-detail', params: { id: item.id } })}
        />
      ))}
    </Screen>
  );
}
