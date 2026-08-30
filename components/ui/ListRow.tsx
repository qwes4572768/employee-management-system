import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

interface ListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  disabled?: boolean;
}

export function ListRow({ title, subtitle, meta, onPress, disabled }: ListRowProps) {
  const { colors, fontScale } = useTheme();
  const content = (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
      <View style={styles.body}>
        <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '700' })}>{title}</Text>
        {subtitle ? (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, marginRight: 8 })}>{meta}</Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress || disabled) {
    return content;
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    width: '100%',
  },
  body: { flex: 1, minWidth: 0 },
});
