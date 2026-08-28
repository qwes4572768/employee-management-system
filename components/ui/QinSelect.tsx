import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface QinSelectProps<T extends string> {
  label: string;
  value: T | '';
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
}

export function QinSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = '請選擇',
}: QinSelectProps<T>) {
  const { colors, fontScale } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((item) => item.value === value);

  return (
    <View style={styles.wrap}>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: 6 })}>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
      >
        <Text style={textStyle(colors, fontScale, 'md', { color: current ? colors.text : colors.textSubtle })}>
          {current?.label ?? placeholder}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
          <SafeAreaView style={[styles.sheet, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginBottom: spacing.md })}>
              {label}
            </Text>
            <ScrollView>
              {options.map((item) => (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[
                    styles.option,
                    {
                      borderColor: colors.border,
                      backgroundColor: item.value === value ? colors.accentMuted : 'transparent',
                    },
                  ]}
                >
                  <Text style={textStyle(colors, fontScale, 'md')}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginBottom: spacing.md },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  option: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
