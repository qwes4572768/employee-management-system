import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function MessagesLayout() {
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
      <Stack.Screen name="index" options={{ title: '訊息' }} />
    </Stack>
  );
}
