import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { getDisciplineDetail, reviewDiscipline } from '@/services/disciplineService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { DisciplinaryRecommendation, DisciplinaryReview } from '@/types';

export default function DisciplineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [rec, setRec] = useState<DisciplinaryRecommendation | null>(null);
  const [reviews, setReviews] = useState<DisciplinaryReview[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getDisciplineDetail(actor, id);
    setRec(detail.recommendation);
    setReviews(detail.reviews);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const decide = (decision: 'approved' | 'rejected' | 'returned' | 'modified', confirmSelfApprove = false) => {
    if (!rec) return;
    void reviewDiscipline(actor, { recommendationId: rec.id, decision, reviewNote: note, confirmSelfApprove })
      .then(load)
      .catch((err) => {
        const message = err instanceof Error ? err.message : '審核失敗';
        if (message.includes('二次確認')) {
          Alert.alert('二次確認', '您是此建議的提出人。企業總管理員自行核決需要二次確認。', [
            { text: '取消', style: 'cancel' },
            { text: '確認核決', onPress: () => decide(decision, true) },
          ]);
          return;
        }
        setError(message);
      });
  };

  if (!rec) {
    return (
      <Screen>
        <ErrorBanner message={error} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinCard style={{ marginBottom: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '800' })}>{rec.actionLabelSnapshot}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>{rec.reason}</Text>
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.warning, marginTop: 8 })}>
          狀態 {rec.status}
          {rec.compensationClaimAmount != null ? ` · 賠償建議 ${rec.compensationClaimAmount}` : ''} · 不會直接扣薪
        </Text>
      </QinCard>
      {reviews.map((item) => (
        <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700' })}>{item.decision}</Text>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 4 })}>{item.reviewNote}</Text>
        </QinCard>
      ))}
      <QinInput label="審核意見" value={note} onChangeText={setNote} multiline />
      {can('discipline.approve') && rec.status === 'pending_review' ? (
        <>
          <QinButton label="核准" onPress={() => decide('approved')} />
          <QinButton label="拒絕" variant="danger" style={{ marginTop: spacing.sm }} onPress={() => decide('rejected')} />
          <QinButton label="退回" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => decide('returned')} />
        </>
      ) : null}
    </Screen>
  );
}
