import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function DutyLayout() {
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
      <Stack.Screen name="index" options={{ title: '勤務' }} />
      <Stack.Screen name="schedule" options={{ title: '我的班表' }} />
      <Stack.Screen name="clock" options={{ title: '出勤打卡' }} />
      <Stack.Screen name="leave" options={{ title: '我的假勤' }} />
      <Stack.Screen name="leave-new" options={{ title: '申請假勤' }} />
      <Stack.Screen name="leave-detail" options={{ title: '假勤明細' }} />
      <Stack.Screen name="correction-new" options={{ title: '申請補卡' }} />
      <Stack.Screen name="scan" options={{ title: '掃描 QR' }} />
    </Stack>
  );
}
