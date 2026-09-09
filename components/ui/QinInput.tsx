import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

interface QinInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  error?: string | null;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function QinInput({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  multiline,
  error,
  editable = true,
  style,
}: QinInputProps) {
  const { colors, fontScale } = useTheme();
  const [hidden, setHidden] = useState(Boolean(secure));

  return (
    <View style={[styles.wrap, style]}>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: 6 })}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.bgInput,
            borderColor: error ? colors.danger : colors.border,
            minHeight: multiline ? 92 : 48,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={editable}
          multiline={multiline}
          style={[
            textStyle(colors, fontScale, 'md', { flex: 1, padding: 0 }),
            { textAlignVertical: multiline ? 'top' : 'center' },
          ]}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={8}>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent })}>
              {hidden ? '顯示' : '隱藏'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.danger, marginTop: 4 })}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginBottom: spacing.md },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
