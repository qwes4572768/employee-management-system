import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { CoverageLines } from '@/components/staffing/CoverageLines';
import { LEAVE_TYPE_LABELS } from '@/constants/leave';
import { UNSET_MINIMUM_HEADCOUNT_LABEL } from '@/constants/staffing';
import { useSession } from '@/providers/SessionProvider';
import { getUserById } from '@/repositories/userRepository';
import {
  getLeaveDetail,
  recordLeaveInterview,
  reviewLeaveRequest,
  verifyLeaveDocument,
} from '@/services/leaveService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { LeaveRequest, LeaveRequestAttachment, LeaveReviewHistory, ShiftCoverage, WorkSchedule } from '@/types';

export default function LeaveReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [request, setRequest] = useState<LeaveRequest | null>(null);
  const [name, setName] = useState('');
  const [history, setHistory] = useState<LeaveReviewHistory[]>([]);
  const [attachments, setAttachments] = useState<LeaveRequestAttachment[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [impacts, setImpacts] = useState<ShiftCoverage[]>([]);
  const [note, setNote] = useState('');
  const [interview, setInterview] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const detail = await getLeaveDetail(actor, id);
    setRequest(detail.request);
    setHistory(detail.history);
    setAttachments(detail.attachments);
    setSchedules(detail.schedules);
    setImpacts(detail.impact.impacts);
    const user = await getUserById(detail.request.userId, actor.tenantId ?? undefined);
    setName(user?.fullName ?? detail.request.userId);
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
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBanner message={error} />
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{name}</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        {LEAVE_TYPE_LABELS[request.leaveType]} · {request.startDate}～{request.endDate} · {request.days}日
      </Text>
      {impacts.map((impact) => (
        <QinCard key={`${impact.siteId}-${impact.workDate}-${impact.shiftTemplateId ?? 'none'}`} style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'sm', { fontWeight: '800' })}>
            {impact.siteName} · {impact.shiftName} · {impact.workDate}
          </Text>
          <CoverageLines coverage={impact} unsetLabel={UNSET_MINIMUM_HEADCOUNT_LABEL} />
        </QinCard>
      ))}
      {schedules.length > 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { marginBottom: spacing.md })}>
          本次請假影響 {schedules.length} 個勤務班次
        </Text>
      ) : null}
      {attachments.map((item) => (
        <Text key={item.id} style={textStyle(colors, fontScale, 'sm', { color: colors.accent })}>
          附件 {item.fileName}
        </Text>
      ))}
      <QinInput label="審核備註 / 原因" value={note} onChangeText={setNote} multiline />
      {request.managerInterviewRequired ? (
        <>
          <QinInput label="面談內容" value={interview} onChangeText={setInterview} multiline />
          <QinButton
            label="完成面談紀錄"
            variant="secondary"
            onPress={() => {
              void recordLeaveInterview(actor, request.id, { content: interview, result: 'completed' })
                .then(load)
                .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
            }}
          />
        </>
      ) : null}
      {can('leave.approve') ? (
        <QinButton
          label="核准"
          onPress={() => {
            void reviewLeaveRequest(actor, request.id, 'approved', { note })
              .then(() => router.back())
              .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
          }}
        />
      ) : null}
      {can('leave.return') ? (
        <QinButton
          label="退回補件"
          variant="secondary"
          onPress={() => {
            void reviewLeaveRequest(actor, request.id, 'returned', { note })
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
          }}
        />
      ) : null}
      {can('leave.reject') ? (
        <QinButton
          label="拒絕"
          variant="danger"
          onPress={() => {
            void reviewLeaveRequest(actor, request.id, 'rejected', { note })
              .then(() => router.back())
              .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
          }}
        />
      ) : null}
      {can('leave.approve') ? (
        <QinButton
          label="確認證明文件"
          variant="ghost"
          onPress={() => {
            void verifyLeaveDocument(actor, request.id, true)
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : '失敗'));
          }}
        />
      ) : null}
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
      {history.map((item) => (
        <QinCard key={item.id} style={{ marginTop: spacing.sm }}>
          <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted })}>{formatDateTimeZh(item.createdAt)}</Text>
          <Text style={textStyle(colors, fontScale, 'sm')}>{item.action}{item.note ? ` · ${item.note}` : ''}</Text>
        </QinCard>
      ))}
    </Screen>
  );
}
