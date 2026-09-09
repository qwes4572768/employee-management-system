import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { APP_NAME, APP_NAME_EN } from '@/constants/app';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

const LOGO = require('../../assets/logo.png');

const LOGO_SIZES = { sm: 36, md: 96, lg: 140 } as const;

type BrandMarkProps = {
  size?: keyof typeof LOGO_SIZES;
  layout?: 'stack' | 'row';
  showName?: boolean;
  showEnglish?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function BrandMark({
  size = 'md',
  layout = 'stack',
  showName = true,
  showEnglish = true,
  style,
}: BrandMarkProps) {
  const { colors, fontScale } = useTheme();
  const logoSize = LOGO_SIZES[size];
  const stacked = layout === 'stack';
  const nameSize = size === 'sm' ? 'md' : size === 'md' ? 'xxl' : 'hero';

  return (
    <View
      style={[styles.wrap, stacked ? styles.stack : styles.row, style]}
      accessibilityRole="header"
      accessibilityLabel={APP_NAME}
    >
      <Image
        source={LOGO}
        style={{ width: logoSize, height: logoSize }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      {showName ? (
        <View style={[styles.titles, stacked && styles.titlesCenter]}>
          <Text
            style={textStyle(colors, fontScale, nameSize, {
              fontWeight: '800',
              textAlign: stacked ? 'center' : 'left',
            })}
          >
            {APP_NAME}
          </Text>
          {showEnglish ? (
            <Text
              style={textStyle(colors, fontScale, 'xs', {
                color: colors.accent,
                letterSpacing: 2,
                marginTop: 4,
                textAlign: stacked ? 'center' : 'left',
              })}
            >
              {APP_NAME_EN.toUpperCase()}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  stack: { flexDirection: 'column', gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  titles: { minWidth: 0 },
  titlesCenter: { alignItems: 'center' },
});
