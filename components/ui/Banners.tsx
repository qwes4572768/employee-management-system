import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export function ErrorBanner({ message }: { message: string | null }) {
  const { colors, fontScale } = useTheme();
  if (!message) {
    return null;
  }
  return (
    <View style={[styles.box, { backgroundColor: 'rgba(255,77,106,0.12)', borderColor: colors.danger }]}>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.danger })}>{message}</Text>
    </View>
  );
}

export function InfoBanner({ message }: { message: string }) {
  const { colors, fontScale } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.accentMuted, borderColor: colors.border }]}>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.text })}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
});
