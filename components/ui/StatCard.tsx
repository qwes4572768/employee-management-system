import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { QinCard } from '@/components/ui/QinCard';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  const { colors, fontScale } = useTheme();
  return (
    <QinCard style={styles.card}>
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, letterSpacing: 1 })}>
        {label}
      </Text>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: 6 })}>{value}</Text>
      {hint ? (
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: 4 })}>
          {hint}
        </Text>
      ) : null}
    </QinCard>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
    maxWidth: '100%',
  },
});
