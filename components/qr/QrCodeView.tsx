import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { BrandMark } from '@/components/ui/BrandMark';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export function QrCodeView({
  value,
  size = 220,
  caption,
}: {
  value: string;
  size?: number;
  caption?: string;
}) {
  const { colors, fontScale } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: spacing.md }}>
      <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12 }}>
        <QRCode value={value} size={size} ecl="H" quietZone={16} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      <BrandMark size="sm" layout="row" showEnglish={false} style={{ marginTop: spacing.md }} />
      {caption ? (
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' })}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
