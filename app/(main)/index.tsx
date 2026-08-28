import { useState } from 'react';
import { Text } from 'react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SiteSwitcher } from '@/components/layout/SiteSwitcher';
import { HudScanLine } from '@/components/hud/HudScanLine';
import { QinCard } from '@/components/ui/QinCard';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { GENDER_LABELS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';

export default function DashboardScreen() {
  const { user, tenant, currentSite, authorizedSites, selectSite, roles } = useSession();
  const { colors, fontScale } = useTheme();
  const [switcher, setSwitcher] = useState(false);

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
        <Text style={textStyle(colors, fontScale, 'md', { color: colors.textMuted, marginTop: spacing.sm })}>
          目前尚無當班資料
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textSubtle, marginTop: 4 })}>
          排班功能啟用後，將顯示當班勤務人員。目前不會顯示任何虛構班表。
        </Text>
      </QinCard>
      {user ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, letterSpacing: 1 })}>
            目前登入
          </Text>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: 6 })}>
            {user.fullName}
          </Text>
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
        <StatCard label="今日勤務狀態" value="—" hint="功能尚未啟用" />
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
