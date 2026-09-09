import { Link, Stack } from 'expo-router';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { QinButton } from '@/components/ui/QinButton';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';

export default function NotFound() {
  const { colors, fontScale } = useTheme();
  return (
    <Screen>
      <Stack.Screen options={{ title: '頁面不存在' }} />
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: 12 })}>
        找不到這個頁面
      </Text>
      <Link href="/" asChild>
        <QinButton label="回到起始頁" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}
