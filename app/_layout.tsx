import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Bootstrapper({ children }: { children: React.ReactNode }) {
  const { refresh, ready } = useSession();
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <>{ready ? children : children}</>;
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
