import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function HudScanLine({ active = true }: { active?: boolean }) {
  const { colors, reduceMotion } = useTheme();
  if (reduceMotion || !active) {
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.lineWrap}>
      <View style={[styles.line, { backgroundColor: colors.hudLine }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  lineWrap: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
  },
  line: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.7,
  },
});
