import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function MainLayout() {
  const { session, user, can } = useSession();
  const { colors, fontScale } = useTheme();
      const showManage =
    can('users.view') ||
    can('sites.view') ||
    can('roles.view') ||
    can('audit.view') ||
    can('accounts.view') ||
    can('tenants.view') ||
    can('schedule.view') ||
    can('leave.view') ||
    can('attendance.correct.approve') ||
    can('staffingRequirement.view') ||
    can('staffingRequirement.manage') ||
    can('qrAsset.view') ||
    can('qrAsset.create') ||
    can('inspectionDashboard.view') ||
    can('inspectionCriteria.view') ||
    can('improvement.review') ||
    can('discipline.review');

  if (!session || user?.status !== 'active') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          minHeight: 58,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontScale === 'xlarge' ? 12 : 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首頁',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="duty"
        options={{
          title: '勤務',
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inspect"
        options={{
          title: '掃碼督勤',
          href: can('inspection.scan') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="scan-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: '訊息',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: '管理',
          href: showManage ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="construct-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
