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
      <Stack.Screen name="shifts/index" options={{ title: '班別設定' }} />
      <Stack.Screen name="shifts/new" options={{ title: '新增班別' }} />
      <Stack.Screen name="schedules/index" options={{ title: '智慧排班' }} />
      <Stack.Screen name="schedules/new" options={{ title: '新增排班' }} />
      <Stack.Screen name="corrections/index" options={{ title: '補卡審核' }} />
      <Stack.Screen name="leave-review/index" options={{ title: '請假審核' }} />
      <Stack.Screen name="leave-review/[id]" options={{ title: '假勤審核' }} />
      <Stack.Screen name="workforce" options={{ title: '勤務與假勤設定' }} />
      <Stack.Screen name="staffing-requirements/index" options={{ title: '人力需求' }} />
      <Stack.Screen name="staffing-requirements/new" options={{ title: '新增人力需求' }} />
      <Stack.Screen name="staffing-requirements/[id]" options={{ title: '人力需求詳情' }} />
      <Stack.Screen name="qr-assets/index" options={{ title: 'QR 資產中心' }} />
      <Stack.Screen name="qr-assets/new-employee" options={{ title: '建立人員 QR' }} />
      <Stack.Screen name="qr-assets/new-site" options={{ title: '建立案場 QR' }} />
      <Stack.Screen name="qr-assets/[id]" options={{ title: 'QR 詳情' }} />
      <Stack.Screen name="qr-assets/scans" options={{ title: '掃描紀錄' }} />
    </Stack>
  );
}
