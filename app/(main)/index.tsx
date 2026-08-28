import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SiteSwitcher } from '@/components/layout/SiteSwitcher';
import { HudScanLine } from '@/components/hud/HudScanLine';
import { Avatar } from '@/components/ui/Avatar';
import { QinCard } from '@/components/ui/QinCard';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { GENDER_LABELS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { DUTY_STATUS_LABELS, getDashboardSnapshot, type DashboardStaffingStats, type OnDutyCard } from '@/services/dashboardService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';

export default function DashboardScreen() {
  const { user, tenant, currentSite, authorizedSites, selectSite, roles, actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [switcher, setSwitcher] = useState(false);
  const [primary, setPrimary] = useState<OnDutyCard | null>(null);
  const [others, setOthers] = useState<OnDutyCard[]>([]);
  const [stats, setStats] = useState<{ expected: number; arrived: number; onDuty: number; late: number; missing: number } | null>(null);
  const [staffing, setStaffing] = useState<DashboardStaffingStats | null>(null);
  const [selected, setSelected] = useState<OnDutyCard | null>(null);

  const load = useCallback(async () => {
    const snap = await getDashboardSnapshot(actor, { siteId: currentSite?.id ?? null });
    setPrimary(snap.primary);
    setOthers(snap.others);
    setStats(snap.managerStats);
    setStaffing(snap.staffingStats);
    setSelected(snap.primary);
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const card = selected ?? primary;
  const canSeeDetail = can('users.view') || can('schedule.view') || card?.user.id === user?.id;

  return (
    <Screen>
      <AppHeader
        title="戰情儀表板"
        subtitle={tenant?.officialName ?? '勤管系統'}
        siteLabel={currentSite?.name ?? '尚未選擇案場'}
        onSitePress={() => setSwitcher(true)}
      />
      <QinCard style={{ marginBottom: spacing.md }}>
        <HudScanLine />
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, letterSpacing: 1 })}>
          當班勤務人員
        </Text>
        {card ? (
          <View style={{ marginTop: spacing.sm, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Avatar uri={card.user.photoUri} name={card.user.fullName} />
            <View style={{ flex: 1 }}>
              <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{card.user.fullName}</Text>
              {canSeeDetail ? (
                <>
                  <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
                    {GENDER_LABELS[card.user.gender]} · {card.user.jobTitle ?? '—'} · 到職 {formatDateZh(card.user.hireDate)}
                  </Text>
                  <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
                    {card.shiftName ?? '—'} · {card.site?.name ?? currentSite?.name ?? '—'} · {DUTY_STATUS_LABELS[card.status]}
                  </Text>
                  {card.elapsedLabel ? (
                    <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: 4 })}>
                      {card.elapsedLabel}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
                  {DUTY_STATUS_LABELS[card.status]}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.sm })}>
            目前尚無當班資料
          </Text>
        )}
        {others.length > 0 ? (
          <View style={{ marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {others.map((item) => (
              <Pressable key={item.user.id} onPress={() => setSelected(item)}>
                <Avatar uri={item.user.photoUri} name={item.user.fullName} size={40} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </QinCard>
      {user && !card ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{user.fullName}</Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            {GENDER_LABELS[user.gender]} · {user.jobTitle ?? '—'} · 到職 {formatDateZh(user.hireDate)}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
            {roles.map((role) => role.name).join('、') || '尚未指派角色'}
          </Text>
        </QinCard>
      ) : null}
      <StatGrid>
        <StatCard label="目前案場" value={currentSite?.name ?? '—'} hint={currentSite?.address ?? '尚無資料'} />
        {stats ? (
          <>
            <StatCard label="今日應到" value={String(stats.expected)} hint="含已排班且未取消" />
            <StatCard label="已到" value={String(stats.arrived)} hint="已完成上班打卡" />
            <StatCard label="勤務中" value={String(stats.onDuty)} hint="進行中的勤務階段" />
            <StatCard label="遲到" value={String(stats.late)} hint="超過寬限分鐘" />
            <StatCard label="缺卡" value={String(stats.missing)} hint="應到但尚未打卡" />
            {staffing ? (
              <StatCard
                label="缺員"
                value={staffing.allUnknown ? '—' : String(staffing.shortage)}
                hint={
                  staffing.allUnknown
                    ? '尚未設定最低勤務人數'
                    : staffing.shortage > 0
                      ? staffing.unknown
                        ? '低於最低勤務人數（部分班別尚未設定）'
                        : '低於最低勤務人數'
                      : '已達標'
                }
              />
            ) : null}
          </>
        ) : (
          <StatCard
            label="今日勤務狀態"
            value={card ? DUTY_STATUS_LABELS[card.status] : '—'}
            hint={card?.shiftName ?? '尚無今日排班'}
          />
        )}
        <StatCard label="巡邏完成率" value="—" hint="功能尚未啟用" />
        <StatCard label="異常事件" value="—" hint="功能尚未啟用" />
        <StatCard label="督勤提醒" value="—" hint="功能尚未啟用" />
      </StatGrid>
      <SiteSwitcher
        visible={switcher}
        sites={authorizedSites}
        currentId={currentSite?.id}
        onClose={() => setSwitcher(false)}
        onSelect={(id) => void selectSite(id)}
      />
    </Screen>
  );
}
