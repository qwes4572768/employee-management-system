import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinCard } from '@/components/ui/QinCard';
import { QR_SCAN_RESULT_LABELS } from '@/constants/qr';
import { useSession } from '@/providers/SessionProvider';
import { listScanHistory } from '@/services/qrScannerService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { QrScanLog } from '@/types';

export default function QrScanHistoryScreen() {
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [rows, setRows] = useState<QrScanLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void listScanHistory(actor)
        .then(setRows)
        .catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [actor]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>目前沒有掃描紀錄</Text>
      ) : (
        rows.map((item) => (
          <QinCard key={item.id} style={{ marginBottom: spacing.sm }}>
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted })}>
              {formatDateTimeZh(item.scannedAt)} · {item.scannerNameSnapshot}
            </Text>
            <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '700', marginTop: 4 })}>
              {QR_SCAN_RESULT_LABELS[item.scanResult]}
            </Text>
          </QinCard>
        ))
      )}
    </Screen>
  );
}
