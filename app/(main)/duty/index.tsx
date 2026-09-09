import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ListRow } from '@/components/ui/ListRow';
import { QinCard } from '@/components/ui/QinCard';
import { useSession } from '@/providers/SessionProvider';
import { listNotifications } from '@/repositories/notificationRepository';
import { getActiveWorkSession } from '@/services/workSessionService';
import { DUTY_STATUS_LABELS, getDashboardSnapshot, type OnDutyCard } from '@/services/dashboardService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { AppNotification, WorkSession } from '@/types';

export default function DutyHome() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [card, setCard] = useState<OnDutyCard | null>(null);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [notes, setNotes] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    const snap = await getDashboardSnapshot(actor, { siteId: currentSite?.id });
    setCard(snap.primary);
    if (actor.userId && actor.tenantId) {
      setSession(await getActiveWorkSession(actor.tenantId, actor.userId));
      setNotes(await listNotifications(actor.tenantId, actor.userId));
    }
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {session ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent })}>勤務中</Text>
          <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800', marginTop: 6 })}>
            {currentSite?.name ?? '目前案場'}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            開始 {session.startedAt.replace('T', ' ').slice(0, 16)} · {card?.elapsedLabel ?? ''}
          </Text>
        </QinCard>
      ) : card ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted })}>目前狀態</Text>
          <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800', marginTop: 6 })}>
            {DUTY_STATUS_LABELS[card.status]}
          </Text>
        </QinCard>
      ) : null}

      {can('schedule.viewOwn') || can('schedule.view') ? (
        <ListRow title="我的班表" subtitle="今天 / 本週 / 本月" onPress={() => router.push('/(main)/duty/schedule')} />
      ) : null}
      {can('attendance.clock') || can('workSession.start') ? (
        <ListRow title="打卡與勤務" subtitle="GPS 上班、開始／結束勤務、下班打卡" onPress={() => router.push('/(main)/duty/clock')} />
      ) : null}
      {can('leave.viewOwn') || can('leave.request') ? (
        <ListRow title="我的假勤" subtitle="指定休、特休、病假、喪假、事假、公假" onPress={() => router.push('/(main)/duty/leave')} />
      ) : null}
      {can('attendance.correct.request') ? (
        <ListRow title="申請補卡" subtitle="缺卡或時間更正，需主管核准" onPress={() => router.push('/(main)/duty/correction-new')} />
      ) : null}
      {can('qrScan.use') ? (
        <ListRow title="掃描 QR" subtitle="識別人員或案場永久 QR" onPress={() => router.push('/(main)/duty/scan')} />
      ) : null}
      {can('patrol.viewOwn') || can('patrol.execute') ? (
        <ListRow title="智慧巡邏" subtitle="本班巡邏進度、下一點與現場驗證" onPress={() => router.push('/(main)/duty/patrol')} />
      ) : null}
      {can('visitor.register') ? (
        <ListRow title="訪客登記" subtitle="訪客、廠商、外送與臨時人員" onPress={() => router.push('/(main)/duty/visitors/register')} />
      ) : null}
      {can('visitor.check') || can('visitor.view') ? (
        <ListRow title="訪客進出" subtitle="進場、離場與在場名單" onPress={() => router.push('/(main)/duty/visitors')} />
      ) : null}
      {can('parcel.register') ? (
        <ListRow title="包裹登記" subtitle="到件登記與存放位置" onPress={() => router.push('/(main)/duty/parcels/register')} />
      ) : null}
      {can('parcel.pickup') || can('parcel.view') ? (
        <ListRow title="包裹領取" subtitle="簽收、照片與領取時間" onPress={() => router.push('/(main)/duty/parcels')} />
      ) : null}
      {can('vehicleAccess.check') || can('vehicleAccess.view') ? (
        <ListRow title="車輛進出" subtitle="訪客／臨停車輛進場與離場" onPress={() => router.push('/(main)/duty/vehicles')} />
      ) : null}
      {can('parkingSpace.view') || can('parkingOccupancy.manage') || can('parkingViolation.create') ? (
        <ListRow title="車位與占用" subtitle="查車位、登記占用與異常" onPress={() => router.push('/(main)/duty/parking')} />
      ) : null}
      {can('key.view') || can('key.checkout') || can('key.return') ? (
        <ListRow title="鑰匙借還" subtitle="機房、公設與備用鑰匙" onPress={() => router.push('/(main)/duty/keys')} />
      ) : null}
      {can('loanItem.view') || can('loanItem.borrow') || can('loanItem.return') ? (
        <ListRow title="物品借用" subtitle="推車、雨傘、工具與會議設備" onPress={() => router.push('/(main)/duty/loan-items')} />
      ) : null}

      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm })}>
        本機通知
      </Text>
      {notes.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textSubtle })}>目前沒有通知</Text>
      ) : (
        notes.slice(0, 8).map((item) => (
          <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>{item.title}</Text>
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>{item.body}</Text>
          </QinCard>
        ))
      )}
    </Screen>
  );
}
