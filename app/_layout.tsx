import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot, usePathname } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Bootstrapper({ children }: { children: React.ReactNode }) {
  const { refresh, ready, initializationError } = useSession();
  const { colors } = useTheme();
  const pathname = usePathname();
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh, pathname]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh().catch(() => {});
    });
    return () => subscription.remove();
  }, [refresh]);
  if (!ready || initializationError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: colors.bg }}>
        {initializationError ? <>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, marginBottom: 16 }}>系統暫時無法開啟</Text>
          <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 16, maxWidth: 480, lineHeight: 26 }}>{initializationError}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void refresh().catch(() => {}); }} style={{ marginTop: 24, padding: 16, backgroundColor: colors.accent, borderRadius: 8 }}>
            <Text style={{ color: colors.accentText }}>重試</Text>
          </Pressable>
        </> : <>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.text, marginTop: 16 }}>系統初始化中</Text>
        </>}
      </View>
    );
  }
  return <>{children}</>;
}

function ThemedStatus() {
  const { colors } = useTheme();
  return <StatusBar style={colors.statusBar} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SessionProvider>
            <ThemedStatus />
            <Bootstrapper>
              <Slot />
            </Bootstrapper>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
