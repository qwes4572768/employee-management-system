import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/components/ui/BrandMark';
import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';

export default function IndexGate() {
  const { ready, bootstrapComplete, session, user } = useSession();
  const { colors, fontScale } = useTheme();

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <BrandMark size="lg" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 12 })}>
          系統初始化中
        </Text>
      </View>
    );
  }

  if (!bootstrapComplete) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (session && user?.status === 'active') {
    return <Redirect href="/(main)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
