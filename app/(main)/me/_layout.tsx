import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function MeStack() {
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
      <Stack.Screen name="index" options={{ title: '我的' }} />
      <Stack.Screen name="profile" options={{ title: '個人資料' }} />
      <Stack.Screen name="password" options={{ title: '修改密碼' }} />
      <Stack.Screen name="appearance" options={{ title: '顯示設定' }} />
    </Stack>
  );
}
