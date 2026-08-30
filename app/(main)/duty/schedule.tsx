import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { QinCard } from '@/components/ui/QinCard';
import { Segmented } from '@/components/ui/Segmented';
import { SCHEDULE_TYPE_LABELS } from '@/constants/workforce';
import { useSession } from '@/providers/SessionProvider';
import { getSiteById } from '@/repositories/siteRepository';
import { getShiftTemplateById, requireWorkforceSettings } from '@/repositories/workforceRepository';
import { listMySchedules } from '@/services/scheduleService';
import { evaluateScheduleWarnings } from '@/services/workforceWarningService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { addDays } from '@/utils/scheduleTime';
import { toDateOnly } from '@/utils/datetime';
import type { WorkSchedule, WorkforceWarning } from '@/types';

type RangeKey = 'today' | 'week' | 'month';

function rangeOf(key: RangeKey) {
  const now = new Date();
  const today = toDateOnly(now);
  if (key === 'today') return { startDate: today, endDate: today };
  if (key === 'week') {
    const day = now.getDay() || 7;
    const start = addDays(today, 1 - day);
    return { startDate: start, endDate: addDays(start, 6) };
  }
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: start, endDate: toDateOnly(endDate) };
}

export default function MyScheduleScreen() {
  const { actor, tenant } = useSession();
  const { colors, fontScale } = useTheme();
  const [range, setRange] = useState<RangeKey>('today');
  const [rows, setRows] = useState<Array<{ schedule: WorkSchedule; siteName: string; shiftName: string; warnings: WorkforceWarning[] }>>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const dates = useMemo(() => rangeOf(range), [range]);

  const load = useCallback(async () => {
    if (!tenant) return;
    const list = await listMySchedules(actor, dates);
    const settings = await requireWorkforceSettings(tenant.id);
    const mapped = [];
    for (const schedule of list) {
      const site = await getSiteById(schedule.siteId, tenant.id);
      const shift = schedule.shiftTemplateId ? await getShiftTemplateById(schedule.shiftTemplateId, tenant.id) : null;
      const warnings = await evaluateScheduleWarnings({
        tenantId: tenant.id,
        settings,
        draft: {
          userId: schedule.userId,
          siteId: schedule.siteId,
          workDate: schedule.workDate,
          scheduledStartAt: schedule.scheduledStartAt,
          scheduledEndAt: schedule.scheduledEndAt,
          staffingMode: schedule.staffingModeSnapshot,
          excludeScheduleId: schedule.id,
        },
      });
      mapped.push({
        schedule,
        siteName: site?.name ?? schedule.siteId,
        shiftName: shift?.name ?? '自訂班',
        warnings,
      });
    }
    setRows(mapped);
  }, [actor, dates, tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <Segmented
        value={range}
        options={[
          { value: 'today', label: '今天' },
          { value: 'week', label: '本週' },
          { value: 'month', label: '本月' },
        ]}
        onChange={setRange}
      />
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md })}>
          這個區間尚無班表
        </Text>
      ) : (
        rows.map((row) => {
          const typeLabel =
            row.schedule.scheduleType === 'support'
              ? '機動支援'
              : row.schedule.scheduleType === 'training'
                ? '見習勤務'
                : SCHEDULE_TYPE_LABELS[row.schedule.scheduleType];
          const warn = row.warnings[0];
          return (
            <QinCard key={row.schedule.id} style={{ marginTop: spacing.md }}>
              <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>
                {warn ? '⚠ ' : ''}
                {row.schedule.workDate} · {row.siteName}
              </Text>
              <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
                {row.shiftName} · {row.schedule.scheduledStartAt.replace('T', ' ').slice(0, 16)}～
                {row.schedule.scheduledEndAt.replace('T', ' ').slice(11, 16)}
              </Text>
              <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
                {typeLabel} · {row.schedule.status}
                {row.schedule.leaveStatus === 'leave_approved' ? ' · 已核准請假' : ''}
              </Text>
              {warn ? (
                <Text
                  style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginTop: 8 })}
                  onPress={() => setOpenId(openId === row.schedule.id ? null : row.schedule.id)}
                >
                  {warn.title}
                </Text>
              ) : null}
              {openId === row.schedule.id
                ? row.warnings.map((item) => (
                    <Text key={item.type + item.message} style={textStyle(colors, fontScale, 'xs', { color: colors.danger, marginTop: 6 })}>
                      {item.title}：{item.message}
                    </Text>
                  ))
                : null}
            </QinCard>
          );
        })
      )}
    </Screen>
  );
}
