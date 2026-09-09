import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { LEAVE_TYPE_LABELS } from '@/constants/leave';
import { useSession } from '@/providers/SessionProvider';
import { attachLeaveFile, getLeaveDetail } from '@/services/leaveService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { LeaveRequest, LeaveRequestAttachment, LeaveReviewHistory, WorkSchedule } from '@/types';

export default function LeaveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [request, setRequest] = useState<LeaveRequest | null>(null);
  const [history, setHistory] = useState<LeaveReviewHistory[]>([]);
  const [attachments, setAttachments] = useState<LeaveRequestAttachment[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getLeaveDetail(actor, id);
    setRequest(detail.request);
    setHistory(detail.history);
    setAttachments(detail.attachments);
    setSchedules(detail.schedules);
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  if (!request) {
    return (
      <Screen>
        <ErrorBanner message={error} />
        <Text style={textStyle(colors, fontScale, 'md')}>找不到申請</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBanner message={error} />
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{LEAVE_TYPE_LABELS[request.leaveType]}</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        {request.startDate}～{request.endDate} · {request.days}日 · {request.status}
        {request.isUrgent ? ' · 急件' : ''}
        {request.documentStatus === 'overdue' ? ' · 病假證明逾期未補' : ''}
      </Text>
      {schedules.length > 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { marginBottom: spacing.md })}>
          本次請假影響 {schedules.length} 個勤務班次
        </Text>
      ) : null}
      {can('leave.attachment.upload') ? (
        <QinButton
          label="上傳附件"
          variant="secondary"
          onPress={() => {
            void (async () => {
              try {
                const picked = await DocumentPicker.getDocumentAsync({
                  type: ['application/pdf', 'image/*'],
                  copyToCacheDirectory: true,
                });
                if (picked.canceled || !picked.assets[0]) return;
                const file = picked.assets[0];
                await attachLeaveFile(actor, request.id, {
                  fileName: file.name,
                  mimeType: file.mimeType ?? 'application/octet-stream',
                  localUri: file.uri,
                  kind: 'document',
                });
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : '上傳失敗');
              }
            })();
          }}
        />
      ) : null}
      {attachments.map((item) => (
        <Text key={item.id} style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
          {item.fileName} · {item.mimeType}
        </Text>
      ))}
      <Text style={textStyle(colors, fontScale, 'lg', { fontWeight: '700', marginTop: spacing.lg })}>時間軸</Text>
      {history.map((item) => (
        <QinCard key={item.id} style={{ marginTop: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted })}>{formatDateTimeZh(item.createdAt)}</Text>
          <Text style={textStyle(colors, fontScale, 'sm')}>{item.action}{item.note ? ` · ${item.note}` : ''}</Text>
        </QinCard>
      ))}
      {can('schedule.create') && request.status === 'approved' && schedules[0] ? (
        <QinButton
          label="安排代班"
          onPress={() =>
            router.push({
              pathname: '/(main)/manage/schedules/new',
              params: {
                siteId: schedules[0]?.siteId,
                workDate: schedules[0]?.workDate,
                shiftTemplateId: schedules[0]?.shiftTemplateId ?? '',
                scheduleType: 'replacement',
              },
            })
          }
        />
      ) : null}
    </Screen>
  );
}
