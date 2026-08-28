import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, subtitle, icon = 'planet-outline', actionLabel, onAction }: EmptyStateProps) {
  const { colors, fontScale } = useTheme();
  return (
    <QinCard>
      <View style={styles.inner}>
        <Ionicons name={icon} size={36} color={colors.accent} />
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', textAlign: 'center' })}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, textAlign: 'center' })}>
            {subtitle}
          </Text>
        ) : null}
        {actionLabel && onAction ? <QinButton label={actionLabel} onPress={onAction} /> : null}
      </View>
    </QinCard>
  );
}

const styles = StyleSheet.create({
  inner: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
