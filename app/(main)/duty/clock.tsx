import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinSelect } from '@/components/ui/QinSelect';
import { useSession } from '@/providers/SessionProvider';
import { listSchedulesForUserInRange } from '@/repositories/workforceRepository';
import { clockIn, clockOut, GpsClockError } from '@/services/attendanceService';
import { ActiveSessionConflictError, endWorkSession, getActiveWorkSession, startWorkSession } from '@/services/workSessionService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { toDateOnly , formatDateTimeZh , formatTimeZh } from '@/utils/datetime';
import type { WorkSchedule, WorkSession } from '@/types';

export default function ClockScreen() {
  const { actor, can, currentSite, authorizedSites, selectSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [today, setToday] = useState<WorkSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState('');
  const [loading, setLoading] = useState(false);
  const siteSchedules = today.filter((row) => row.siteId === currentSite?.id && ['scheduled', 'confirmed'].includes(row.status));

  const load = useCallback(async () => {
    if (!actor.tenantId || !actor.userId) return;
    const date = toDateOnly(new Date());
    setToday(await listSchedulesForUserInRange(actor.tenantId, actor.userId, date, date));
    setSession(await getActiveWorkSession(actor.tenantId, actor.userId));
  }, [actor.tenantId, actor.userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ErrorBanner message={error} />
      {info ? <InfoBanner message={info} /> : null}
      <QinSelect
        label="目前案場"
        value={currentSite?.id ?? ''}
        options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))}
        onChange={(id) => { setScheduleId(''); void selectSite(id); }}
      />
      {siteSchedules.length > 0 ? (
        <QinSelect
          label="今日排班"
          value={scheduleId}
          options={[{ value: '', label: '不連結班表（臨時勤務）' }, ...siteSchedules.map((item) => ({
            value: item.id,
            label: `${formatTimeZh(item.scheduledStartAt)}～${formatTimeZh(item.scheduledEndAt)}`,
          }))]}
          onChange={setScheduleId}
        />
      ) : (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
          今日沒有班表。具備臨時勤務權限者可開始未排班勤務。
        </Text>
      )}
      {session ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800', color: colors.accent })}>勤務中</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            開始時間 {formatDateTimeZh(session.startedAt)}
          </Text>
        </QinCard>
      ) : null}
      {can('attendance.clock') ? (
        <QinButton
          label={currentSite?.requireSiteQr ? '掃描案場 QR 上班打卡' : '上班打卡'}
          loading={loading}
          onPress={() =>
            void run(async () => {
              if (!currentSite) throw new Error('請先選擇案場');
              if (currentSite.requireSiteQr) {
                router.push({ pathname: '/duty/scan', params: { clock: 'in', siteId: currentSite.id, scheduleId } });
                return;
              }
              try {
                await clockIn(actor, { siteId: currentSite.id, scheduleId: scheduleId || null });
                setInfo('上班打卡完成');
              } catch (err) {
                if (err instanceof GpsClockError) throw err;
                throw err;
              }
            })
          }
        />
      ) : null}
      {can('workSession.start') || can('workSession.startUnscheduled') ? (
        <QinButton
          label={!scheduleId ? '開始臨時勤務' : '開始勤務'}
          variant="secondary"
          loading={loading}
          onPress={() =>
            void run(async () => {
              if (!currentSite) throw new Error('請先選擇案場');
              try {
                await startWorkSession(actor, {
                  siteId: currentSite.id,
                  scheduleId: scheduleId || null,
                  unscheduled: !scheduleId,
                });
                setInfo('已開始勤務');
              } catch (err) {
                if (err instanceof ActiveSessionConflictError) throw err;
                throw err;
              }
            })
          }
        />
      ) : null}
      {can('workSession.end') ? (
        <QinButton
          label="結束勤務"
          variant="ghost"
          loading={loading}
          onPress={() =>
            void run(async () => {
              const result = await endWorkSession(actor);
              setInfo(result.missingClockOut ? '勤務已結束，但尚未完成下班打卡' : '勤務已結束');
            })
          }
        />
      ) : null}
      {can('attendance.clock') ? (
        <QinButton
          label={currentSite?.requireSiteQr ? '掃描案場 QR 下班打卡' : '下班打卡'}
          variant="secondary"
          loading={loading}
          onPress={() =>
            void run(async () => {
              if (!currentSite) throw new Error('請先選擇案場');
              if (currentSite.requireSiteQr) {
                router.push({ pathname: '/duty/scan', params: { clock: 'out', siteId: currentSite.id } });
                return;
              }
              await clockOut(actor, { siteId: currentSite.id });
              setInfo('下班打卡完成');
            })
          }
        />
      ) : null}
      <QinButton label="重新定位" variant="ghost" onPress={() => setInfo('請再次按下打卡以重新取得定位')} />
    </Screen>
  );
}
