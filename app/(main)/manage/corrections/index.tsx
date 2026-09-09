import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { getUserById } from '@/repositories/userRepository';
import { listCorrectionsForReview, reviewAttendanceCorrection } from '@/services/attendanceService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { AttendanceCorrectionRequest } from '@/types';

export default function CorrectionReviewScreen() {
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<Array<{ request: AttendanceCorrectionRequest; name: string }>>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listCorrectionsForReview(actor);
    const mapped = [];
    for (const request of list) {
      const user = await getUserById(request.userId, actor.tenantId ?? undefined);
      mapped.push({ request, name: user?.fullName ?? request.userId });
    }
    setRows(mapped);
  }, [actor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="審核備註 / 拒絕原因" value={note} onChangeText={setNote} />
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>目前沒有待審核補卡</Text>
      ) : (
        rows.map(({ request, name }) => (
          <QinCard key={request.id} style={{ marginBottom: spacing.md }}>
            <Text style={textStyle(colors, fontScale, 'md', { fontWeight: '800' })}>{name}</Text>
            <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
              {request.requestType} · {request.reason}
            </Text>
            <QinButton
              label="核准"
              onPress={() => {
                void reviewAttendanceCorrection(actor, request.id, 'approved', note || null)
                  .then(load)
                  .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
              }}
            />
            <QinButton
              label="拒絕"
              variant="danger"
              onPress={() => {
                void reviewAttendanceCorrection(actor, request.id, 'rejected', note)
                  .then(load)
                  .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
              }}
            />
          </QinCard>
        ))
      )}
    </Screen>
  );
}
