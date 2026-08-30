import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function InspectLayout() {
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
      <Stack.Screen name="index" options={{ title: '掃碼督勤' }} />
      <Stack.Screen name="[sessionId]" options={{ title: '現場督勤' }} />
    </Stack>
  );
}
