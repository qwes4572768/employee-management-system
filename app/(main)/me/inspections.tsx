import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinCard } from '@/components/ui/QinCard';
import { INSPECTION_GRADE_LABELS } from '@/constants/inspection';
import { useSession } from '@/providers/SessionProvider';
import { listOwnInspectionHistory } from '@/services/inspectionService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';
import type { InspectionEvaluation, InspectionSession } from '@/types';

export default function MyInspectionsScreen() {
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<Array<{ session: InspectionSession; evaluation: InspectionEvaluation | null; improvementStatus: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void listOwnInspectionHistory(actor)
        .then(setRows)
        .catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [actor]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>尚無督勤紀錄</Text>
      ) : (
        rows.map((row) => (
          <QinCard key={row.session.id} style={{ marginBottom: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '800' })}>
              {formatDateZh(row.session.startedAt)} · {row.session.siteNameSnapshot}
            </Text>
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>
              督勤主管 {row.session.inspectorNameSnapshot} · {row.evaluation ? `${row.evaluation.weightedScore} 分` : '尚未評核'} ·{' '}
              {row.evaluation ? INSPECTION_GRADE_LABELS[row.evaluation.grade] : '—'}
            </Text>
            <Text style={textStyle(colors, fontScale, 'xs', { color: row.evaluation?.majorDeficiency ? colors.danger : colors.textMuted, marginTop: 4 })}>
              {row.evaluation?.majorDeficiency ? '重大缺失' : '無重大缺失'} · 改善 {row.improvementStatus ?? '無'}
            </Text>
          </QinCard>
        ))
      )}
    </Screen>
  );
}
