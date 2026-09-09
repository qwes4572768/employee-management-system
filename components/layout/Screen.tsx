import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = true, padded = true, style }: ScreenProps) {
  const { colors } = useTheme();
  const { contentMaxWidth, width } = useResponsive();
  const inner = (
    <View
      style={[
        styles.inner,
        padded && styles.padded,
        { maxWidth: contentMaxWidth, width: Math.min(width, contentMaxWidth), alignSelf: 'center' },
        style,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {inner}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{inner}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { width: '100%', flexGrow: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md },
});
