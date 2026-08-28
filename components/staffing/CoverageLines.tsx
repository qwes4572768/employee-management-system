import { Text, View } from 'react-native';

import { UNSET_MINIMUM_HEADCOUNT_LABEL } from '@/constants/staffing';
import { coverageResultLabel } from '@/services/staffingRequirementService';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyle } from '@/theme/typography';
import type { ShiftCoverage } from '@/types';

function resultColor(
  status: ShiftCoverage['status'],
  colors: { danger: string; success: string; warning: string; textMuted: string },
) {
  if (status === 'short') return colors.danger;
  if (status === 'over' || status === 'ok') return colors.success;
  return colors.warning;
}

export function CoverageLines({
  coverage,
  unsetLabel = UNSET_MINIMUM_HEADCOUNT_LABEL,
}: {
  coverage: ShiftCoverage;
  unsetLabel?: string;
}) {
  const { colors, fontScale } = useTheme();
  const tone = resultColor(coverage.status, colors);
  if (coverage.status === 'unknown') {
    return (
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginTop: 4 })}>
        {unsetLabel}
      </Text>
    );
  }
  return (
    <View style={{ marginTop: 4, gap: 2 }}>
      <Text style={textStyle(colors, fontScale, 'sm')}>最低需求：{coverage.requiredHeadcount}人</Text>
      <Text style={textStyle(colors, fontScale, 'sm')}>目前已排：{coverage.scheduledHeadcount}人</Text>
      {coverage.status === 'short' ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: tone, fontWeight: '800' })}>
          尚缺：{coverage.shortage}人
        </Text>
      ) : (
        <Text style={textStyle(colors, fontScale, 'sm', { color: tone, fontWeight: '800' })}>
          {coverageResultLabel(coverage, unsetLabel)}
        </Text>
      )}
    </View>
  );
}

export function CoverageBadge({
  coverage,
  unsetLabel = UNSET_MINIMUM_HEADCOUNT_LABEL,
}: {
  coverage: ShiftCoverage;
  unsetLabel?: string;
}) {
  const { colors, fontScale } = useTheme();
  const tone = resultColor(coverage.status, colors);
  return (
    <Text style={textStyle(colors, fontScale, 'xs', { color: tone, fontWeight: '800', marginTop: 6 })}>
      {coverageResultLabel(coverage, unsetLabel)}
    </Text>
  );
}
