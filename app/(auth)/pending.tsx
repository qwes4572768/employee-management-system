import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function PendingScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  return (
    <Screen>
      <QinCard>
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: spacing.sm })}>
          帳號正在等待主管開通
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
          申請已送出。主管可在「管理 → 帳號審核」核准、退回補資料或拒絕。開通後即可登入主要功能。
        </Text>
        <QinButton label="返回登入" onPress={() => router.replace('/(auth)/login')} />
      </QinCard>
    </Screen>
  );
}
