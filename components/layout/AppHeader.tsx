import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onSitePress?: () => void;
  siteLabel?: string;
}

export function AppHeader({ title, subtitle, onSitePress, siteLabel }: AppHeaderProps) {
  const { colors, fontScale } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.titles}>
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, letterSpacing: 2 })}>
          QINGUAN SYSTEM
        </Text>
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: 4 })}>{title}</Text>
        {subtitle ? (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onSitePress ? (
        <Pressable
          onPress={onSitePress}
          style={[styles.site, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
        >
          <Ionicons name="location-outline" size={16} color={colors.accent} />
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.text, maxWidth: 120 })} numberOfLines={1}>
            {siteLabel ?? '尚未選擇案場'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  titles: { flex: 1, minWidth: 180 },
  site: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
