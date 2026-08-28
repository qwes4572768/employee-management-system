import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function ManageStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: '管理' }} />
      <Stack.Screen name="company" options={{ title: '公司資料' }} />
      <Stack.Screen name="sites/index" options={{ title: '案場管理' }} />
      <Stack.Screen name="sites/new" options={{ title: '新增案場' }} />
      <Stack.Screen name="sites/[id]" options={{ title: '案場詳情' }} />
      <Stack.Screen name="accounts/index" options={{ title: '帳號管理' }} />
      <Stack.Screen name="accounts/[id]" options={{ title: '帳號詳情' }} />
      <Stack.Screen name="approvals/index" options={{ title: '帳號審核' }} />
      <Stack.Screen name="approvals/[id]" options={{ title: '審核申請' }} />
      <Stack.Screen name="roles/index" options={{ title: '角色權限' }} />
      <Stack.Screen name="roles/new" options={{ title: '新增角色' }} />
      <Stack.Screen name="roles/[id]" options={{ title: '角色設定' }} />
      <Stack.Screen name="audit/index" options={{ title: '操作日誌' }} />
    </Stack>
  );
}
