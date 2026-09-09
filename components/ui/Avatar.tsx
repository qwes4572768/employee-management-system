import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ uri, name, size = 56 }: AvatarProps) {
  const { colors, fontScale } = useTheme();
  const initial = name.trim().slice(0, 1) || '勤';
  if (uri) {
    return <Image source={{ uri }} style={[styles.img, { width: size, height: size, borderRadius: size / 2, borderColor: colors.accent }]} />;
  }
  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accentMuted,
          borderColor: colors.accent,
        },
      ]}
    >
      <Text style={textStyle(colors, fontScale, 'lg', { color: colors.accent, fontWeight: '800' })}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { borderWidth: 1 },
  fallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
