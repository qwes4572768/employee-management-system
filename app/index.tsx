import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';

export default function IndexGate() {
  const { ready, bootstrapComplete, session, user } = useSession();
  const { colors, fontScale } = useTheme();

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, letterSpacing: 3 })}>
          QINGUAN SYSTEM
        </Text>
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: 12 })}>
          勤管系統
        </Text>
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
