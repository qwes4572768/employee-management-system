import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { CoverageBadge } from '@/components/staffing/CoverageLines';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { Segmented } from '@/components/ui/Segmented';
import { UNSET_STAFFING_REQUIREMENT_LABEL } from '@/constants/staffing';
import { useSession } from '@/providers/SessionProvider';
import { getUserById } from '@/repositories/userRepository';
import { getSiteById } from '@/repositories/siteRepository';
import { commitCopySchedules, copyDay, copyMonth, copyWeek, listSiteSchedules } from '@/services/scheduleService';
import { listSiteCoveragesForActor } from '@/services/staffingRequirementService';
import { evaluateScheduleWarnings } from '@/services/workforceWarningService';
import { requireWorkforceSettings } from '@/repositories/workforceRepository';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { addDays } from '@/utils/scheduleTime';
import { toDateOnly } from '@/utils/datetime';
import type { ShiftCoverage, WorkSchedule, WorkforceWarning } from '@/types';

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

export default function ScheduleBoardScreen() {
  const router = useRouter();
  const { actor, currentSite, tenant, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [range, setRange] = useState<RangeKey>('today');
  const [rows, setRows] = useState<Array<{ schedule: WorkSchedule; userName: string; siteName: string; warnings: WorkforceWarning[] }>>([]);
  const [coverages, setCoverages] = useState<ShiftCoverage[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const dates = useMemo(() => rangeOf(range), [range]);

  const load = useCallback(async () => {
    if (!currentSite || !tenant) return;
    const list = await listSiteSchedules(actor, currentSite.id, dates.startDate, dates.endDate);
    const settings = await requireWorkforceSettings(tenant.id);
    const mapped = [];
    for (const schedule of list) {
      const user = await getUserById(schedule.userId, tenant.id);
      const site = await getSiteById(schedule.siteId, tenant.id);
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
        userName: user?.fullName ?? schedule.userId,
        siteName: site?.name ?? schedule.siteId,
        warnings,
      });
    }
    setRows(mapped);
    setCoverages(await listSiteCoveragesForActor(actor, { siteId: currentSite.id, startDate: dates.startDate, endDate: dates.endDate }));
  }, [actor, currentSite, dates, tenant]);

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
          { value: 'today', label: '今日' },
          { value: 'week', label: '本週' },
          { value: 'month', label: '本月' },
        ]}
        onChange={setRange}
      />
      {can('schedule.create') ? (
        <QinButton label="新增排班" onPress={() => router.push('/(main)/manage/schedules/new')} />
      ) : null}
      {coverages.map((coverage) => (
        <QinCard key={`${coverage.workDate}-${coverage.shiftTemplateId ?? 'none'}`} style={{ marginTop: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>
            {coverage.workDate} · {coverage.shiftName}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            {coverage.siteName}
            {coverage.requiredHeadcount != null
              ? ` · 最低需求 ${coverage.requiredHeadcount}人 · 目前已排 ${coverage.scheduledHeadcount}人`
              : ''}
          </Text>
          <CoverageBadge coverage={coverage} unsetLabel={UNSET_STAFFING_REQUIREMENT_LABEL} />
        </QinCard>
      ))}
      {rows.map((row) => {
        const coverage = coverages.find(
          (item) => item.workDate === row.schedule.workDate && (item.shiftTemplateId ?? null) === (row.schedule.shiftTemplateId ?? null),
        );
        return (
        <Pressable key={row.schedule.id} onPress={() => setOpenId(openId === row.schedule.id ? null : row.schedule.id)}>
          <QinCard style={{ marginTop: spacing.md }}>
            <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>
              {row.warnings.length ? '⚠ ' : ''}
              {row.userName} · {row.siteName}
            </Text>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
              {row.schedule.workDate} {row.schedule.scheduledStartAt.slice(11, 16)}～{row.schedule.scheduledEndAt.slice(11, 16)}
              {row.schedule.leaveStatus === 'leave_approved' ? ' · 已核准請假' : ''}
            </Text>
            {coverage ? <CoverageBadge coverage={coverage} unsetLabel={UNSET_STAFFING_REQUIREMENT_LABEL} /> : null}
            {openId === row.schedule.id
              ? row.warnings.map((w) => (
                  <Text key={w.message} style={textStyle(colors, fontScale, 'xs', { color: colors.danger, marginTop: 6 })}>
                    {w.title}：{w.message}
                  </Text>
                ))
              : null}
          </QinCard>
        </Pressable>
        );
      })}
      {can('schedule.create') && currentSite ? (
        <>
          <QinInput label="複製目標日起 YYYY-MM-DD" value={targetDate} onChangeText={setTargetDate} />
          <QinButton
            label="預覽複製此區間"
            variant="secondary"
            onPress={() => {
              void (async () => {
                if (!currentSite || !targetDate) return;
                const preview =
                  range === 'today'
                    ? await copyDay(actor, currentSite.id, dates.startDate, targetDate)
                    : range === 'week'
                      ? await copyWeek(actor, currentSite.id, dates.startDate, targetDate)
                      : await copyMonth(actor, currentSite.id, dates.startDate, targetDate);
                setCopyMsg(`成功候選 ${preview.ok.length}，衝突 ${preview.conflicts.length}`);
              })();
            }}
          />
          {copyMsg ? (
            <>
              <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginVertical: spacing.sm })}>{copyMsg}</Text>
              <QinButton
                label="確認建立允許的資料"
                onPress={() => {
                  void (async () => {
                    if (!currentSite || !targetDate) return;
                    const result = await commitCopySchedules(actor, {
                      siteId: currentSite.id,
                      sourceStart: dates.startDate,
                      sourceEnd: dates.endDate,
                      targetStart: targetDate,
                    });
                    setCopyMsg(`已建立 ${result.created.length} 筆，略過衝突 ${result.skipped}`);
                    await load();
                  })();
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
