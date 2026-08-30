import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { BrandMark } from '@/components/ui/BrandMark';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { InfoBanner } from '@/components/ui/Banners';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();

  return (
    <Screen>
      <BrandMark size="lg" style={{ marginBottom: spacing.lg, alignSelf: 'center' }} />
      <Text style={textStyle(colors, fontScale, 'hero', { fontWeight: '800', marginTop: 8, textAlign: 'center' })}>
        歡迎使用
      </Text>
      <Text style={textStyle(colors, fontScale, 'md', { color: colors.textMuted, marginTop: 8, marginBottom: spacing.xl })}>
        保全與物業勤務管理。第一階段資料保存在本機，並已預留多租戶與雲端同步架構。
      </Text>
      <QinCard style={{ marginBottom: spacing.lg }}>
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginBottom: 8 })}>
          系統初始化
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
          建立第一位總管理員、公司資料，以及可稍後再補的第一個案場。資料庫一開始是空白的，不會帶入任何示範內容。
        </Text>
        <QinButton label="建立新系統" onPress={() => router.push('/(onboarding)/create-admin')} />
      </QinCard>
      <QinCard>
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginBottom: 8 })}>
          加入既有公司
        </Text>
        <InfoBanner message="雲端企業加入功能將於伺服器版本開放" />
        <QinButton
          label="尚未啟用"
          variant="secondary"
          onPress={() =>
            Alert.alert('尚未啟用', '加入既有公司需要雲端伺服器。目前請使用「建立新系統」，或向已建置公司的主管申請帳號。')
          }
        />
      </QinCard>
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
