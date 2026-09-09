import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { QinCard } from '@/components/ui/QinCard';
import { Segmented } from '@/components/ui/Segmented';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { FontScale, ThemeMode } from '@/theme/tokens';

export default function AppearanceScreen() {
  const { mode, setMode, fontScale, setFontScale, reduceMotion, colors } = useTheme();
  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'md', { marginBottom: spacing.sm })}>主題</Text>
      <Segmented
        value={mode}
        onChange={(v) => setMode(v as ThemeMode)}
        options={[
          { value: 'cyber', label: '藍黑科技' },
          { value: 'outdoor', label: '戶外高亮' },
          { value: 'night', label: '夜間低亮' },
          { value: 'system', label: '跟隨系統' },
        ]}
      />
      <Text style={textStyle(colors, fontScale, 'md', { marginBottom: spacing.sm })}>文字大小</Text>
      <Segmented
        value={fontScale}
        onChange={(v) => setFontScale(v as FontScale)}
        options={[
          { value: 'standard', label: '標準' },
          { value: 'large', label: '大' },
          { value: 'xlarge', label: '特大' },
        ]}
      />
      <QinCard>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>
          減少動態效果：{reduceMotion ? '已開啟（系統設定）' : '未開啟'}。動畫會自動跟隨系統 Reduce Motion。
        </Text>
      </QinCard>
    </Screen>
  );
}
