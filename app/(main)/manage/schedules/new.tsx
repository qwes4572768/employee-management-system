import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { STAFFING_MODE_LABELS } from '@/constants/staffing';
import { SCHEDULE_TYPE_LABELS, type ScheduleType } from '@/constants/workforce';
import { useSession } from '@/providers/SessionProvider';
import { listUsersByTenant } from '@/repositories/userRepository';
import { listSites } from '@/repositories/siteRepository';
import { createSchedule, getShiftTemplates, previewSchedule, ScheduleDecisionError } from '@/services/scheduleService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Site, User, WorkforceWarning } from '@/types';

export default function NewScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ siteId?: string; workDate?: string; shiftTemplateId?: string; scheduleType?: string }>();
  const { actor, tenant, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [userId, setUserId] = useState('');
  const [siteId, setSiteId] = useState(params.siteId || currentSite?.id || '');
  const [workDate, setWorkDate] = useState(params.workDate || '');
  const [templateId, setTemplateId] = useState(params.shiftTemplateId || '');
  const [scheduleType, setScheduleType] = useState<ScheduleType>((params.scheduleType as ScheduleType) || 'normal');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [allowTraining, setAllowTraining] = useState(false);
  const [trainingReason, setTrainingReason] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [restReason, setRestReason] = useState('');
  const [warnings, setWarnings] = useState<WorkforceWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    void listUsersByTenant(tenant.id).then(setUsers);
    void listSites(tenant.id).then(setSites);
    void getShiftTemplates(actor, siteId || null).then((items) => setTemplates(items.map((t) => ({ id: t.id, name: t.name }))));
  }, [actor, tenant, siteId]);

  const selected = users.find((u) => u.id === userId);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect label="人員" value={userId} options={users.map((u) => ({ value: u.id, label: `${u.fullName}（${STAFFING_MODE_LABELS[u.staffingMode]}）` }))} onChange={setUserId} />
      <QinSelect label="案場" value={siteId} options={sites.map((s) => ({ value: s.id, label: s.name }))} onChange={setSiteId} />
      <QinInput label="勤務日期 YYYY-MM-DD" value={workDate} onChangeText={setWorkDate} />
      <QinSelect
        label="班別"
        value={templateId}
        options={templates.map((t) => ({ value: t.id, label: t.name }))}
        onChange={setTemplateId}
      />
      <QinSelect
        label="排班類型"
        value={scheduleType}
        options={Object.entries(SCHEDULE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        onChange={(v) => setScheduleType(v as ScheduleType)}
      />
      {selected?.staffingMode === 'trainee' ? (
        <>
          <SwitchRow label="允許見習重疊排班" value={allowTraining} onValueChange={setAllowTraining} />
          <QinInput label="見習原因 / 備註" value={trainingReason} onChangeText={setTrainingReason} />
          <QinSelect
            label="帶訓人員（選填）"
            value={trainerId}
            options={users.filter((u) => u.id !== userId).map((u) => ({ value: u.id, label: u.fullName }))}
            onChange={setTrainerId}
          />
        </>
      ) : null}
      <QinInput label="休息不足 / 週休預警強制理由" value={restReason} onChangeText={setRestReason} />
      {warnings.map((w) => (
        <QinCard key={w.title + w.message} style={{ marginBottom: spacing.sm, borderColor: w.severity === 'block' ? undefined : undefined }}>
          <Text style={textStyle(colors, fontScale, 'sm', { color: w.severity === 'block' ? colors.danger : colors.warning, fontWeight: '800' })}>
            {w.title}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>{w.message}</Text>
          {w.overlap ? (
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, marginTop: 6 })}>
              既有：{w.overlap.existingSiteName} {w.overlap.existingStartAt.replace('T', ' ').slice(0, 16)}～{w.overlap.existingEndAt.slice(11, 16)}
              {'\n'}本次：{w.overlap.newSiteName} {w.overlap.newStartAt.replace('T', ' ').slice(0, 16)}～{w.overlap.newEndAt.replace('T', ' ').slice(0, 16)}
              {'\n'}重疊：{w.overlap.overlapMinutes} 分鐘
            </Text>
          ) : null}
        </QinCard>
      ))}
      <QinButton
        label="檢查預警"
        variant="secondary"
        onPress={() => {
          void (async () => {
            setError(null);
            try {
              const result = await previewSchedule(actor, {
                userId,
                siteId,
                workDate,
                shiftTemplateId: templateId || null,
                scheduleType,
              });
              setWarnings(result.warnings);
            } catch (err) {
              setError(err instanceof Error ? err.message : '檢查失敗');
            }
          })();
        }}
      />
      <QinButton
        label="儲存排班"
        loading={loading}
        onPress={() => {
          void (async () => {
            setLoading(true);
            setError(null);
            try {
              await createSchedule(actor, {
                userId,
                siteId,
                workDate,
                shiftTemplateId: templateId || null,
                scheduleType,
                allowTrainingOverlap: allowTraining,
                trainingReason: trainingReason || null,
                trainerUserId: trainerId || null,
                restOverrideReason: restReason || null,
                weeklyRestOverrideReason: restReason || null,
              });
              router.back();
            } catch (err) {
              if (err instanceof ScheduleDecisionError) {
                setWarnings(err.warnings);
                setError(err.message);
              } else {
                setError(err instanceof Error ? err.message : '儲存失敗');
              }
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
