import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

interface QinCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function QinCard({ children, style, padded = true }: QinCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.border,
        },
        padded && styles.padded,
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.corner, styles.tl, { borderColor: colors.hudLine }]} />
      <View pointerEvents="none" style={[styles.corner, styles.tr, { borderColor: colors.hudLine }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    width: '100%',
  },
  padded: {
    padding: spacing.lg,
  },
  corner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderWidth: 1.5,
  },
  tl: { top: 6, left: 6, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 6, right: 6, borderLeftWidth: 0, borderBottomWidth: 0 },
});
