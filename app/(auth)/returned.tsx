import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function ReturnedScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const { account } = useLocalSearchParams<{ account?: string }>();
  return (
    <Screen>
      <QinCard>
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: spacing.sm })}>
          帳號已退回補資料
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
          {account ? `帳號「${account}」` : '此帳號'}已被主管退回。請聯絡主管確認需補件內容，並重新註冊送出正確資料。
        </Text>
        <QinButton label="前往註冊" onPress={() => router.replace('/(auth)/register')} />
      </QinCard>
    </Screen>
  );
}
