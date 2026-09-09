import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

interface Option<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<Option<T>>;
  onChange: (value: T) => void;
}) {
  const { colors, fontScale } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
      {options.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[styles.item, active && { backgroundColor: colors.accentMuted }]}
          >
            <Text style={textStyle(colors, fontScale, 'sm', { color: active ? colors.accent : colors.textMuted, fontWeight: '700' })}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  item: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    justifyContent: 'center',
  },
});
