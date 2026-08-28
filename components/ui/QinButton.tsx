import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { scaledSize, textStyle } from '@/theme/typography';

interface QinButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function QinButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: QinButtonProps) {
  const { colors, fontScale } = useTheme();
  const bg =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.accentMuted
          : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger' ? colors.accentText : colors.text;
  const border = variant === 'ghost' || variant === 'secondary' ? colors.border : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.45 : pressed ? 0.86 : 1,
          minHeight: scaledSize(48, fontScale),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[textStyle(colors, fontScale, 'md', { color: fg, fontWeight: '700', letterSpacing: 0.4 })]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
