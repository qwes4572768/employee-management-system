import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { STAFFING_MODE_LABELS } from '@/constants/staffing';
import { useSession } from '@/providers/SessionProvider';
import { getSiteById } from '@/repositories/siteRepository';
import { getShiftTemplates } from '@/services/scheduleService';
import {
  deactivateStaffingRequirement,
  editStaffingRequirement,
  getStaffingRequirement,
} from '@/services/staffingRequirementService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { SiteShiftRequirement } from '@/types';

const WEEKDAY_OPTIONS = [
  { value: '', label: '不限星期（本階段以生效日為主）' },
  { value: '1', label: '週一' },
  { value: '2', label: '週二' },
  { value: '3', label: '週三' },
  { value: '4', label: '週四' },
  { value: '5', label: '週五' },
  { value: '6', label: '週六' },
  { value: '0', label: '週日' },
];

export default function StaffingRequirementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [item, setItem] = useState<SiteShiftRequirement | null>(null);
  const [siteName, setSiteName] = useState('');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [templateId, setTemplateId] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [staffingMode, setStaffingMode] = useState('');
  const [weekday, setWeekday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const requirement = await getStaffingRequirement(actor, id);
    setItem(requirement);
    setTemplateId(requirement.shiftTemplateId ?? '');
    setHeadcount(String(requirement.requiredHeadcount));
    setStartDate(requirement.effectiveStartDate);
    setEndDate(requirement.effectiveEndDate ?? '');
    setStaffingMode(requirement.staffingMode ?? '');
    setWeekday(requirement.weekday == null ? '' : String(requirement.weekday));
    const site = await getSiteById(requirement.siteId, actor.tenantId ?? undefined);
    setSiteName(site?.name ?? requirement.siteId);
    const list = await getShiftTemplates(actor, requirement.siteId);
    setTemplates(list.map((row) => ({ id: row.id, name: `${row.name}（${row.startTime}～${row.endTime}）` })));
  }, [actor, id]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
  }, [load]);

  if (!item) {
    return (
      <Screen>
        <ErrorBanner message={error} />
      </Screen>
    );
  }

  const canManage = can('staffingRequirement.manage');

  return (
    <Screen>
      <ErrorBanner message={error} />
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{siteName}</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        狀態：{item.status === 'active' ? '啟用' : '停用'}
      </Text>
      <QinSelect
        label="班別"
        value={templateId}
        options={[{ value: '', label: '不限班別（案場預設）' }, ...templates.map((row) => ({ value: row.id, label: row.name }))]}
        onChange={setTemplateId}
      />
      <QinInput label="最低勤務人數" value={headcount} onChangeText={setHeadcount} keyboardType="number-pad" />
      <QinInput label="生效日 YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />
      <QinInput label="失效日 YYYY-MM-DD（選填）" value={endDate} onChangeText={setEndDate} />
      <QinSelect
        label="勤務型態（選填）"
        value={staffingMode}
        options={[
          { value: '', label: '不限型態' },
          ...Object.entries(STAFFING_MODE_LABELS).map(([value, label]) => ({ value, label })),
        ]}
        onChange={setStaffingMode}
      />
      <QinSelect label="僅套用星期（選填）" value={weekday} options={WEEKDAY_OPTIONS} onChange={setWeekday} />
      {canManage ? (
        <>
          <QinButton
            label="儲存修改"
            loading={loading}
            onPress={() => {
              void (async () => {
                setLoading(true);
                setError(null);
                try {
                  const parsed = Number(headcount);
                  if (!Number.isInteger(parsed)) {
                    throw new Error('最低勤務人數須為 0 或正整數');
                  }
                  await editStaffingRequirement(actor, item.id, {
                    shiftTemplateId: templateId || null,
                    requiredHeadcount: parsed,
                    effectiveStartDate: startDate,
                    effectiveEndDate: endDate.trim() || null,
                    staffingMode: staffingMode ? (staffingMode as 'fixed' | 'mobile' | 'trainee') : null,
                    weekday: weekday === '' ? null : Number(weekday),
                  });
                  router.back();
                } catch (err) {
                  setError(err instanceof Error ? err.message : '儲存失敗');
                } finally {
                  setLoading(false);
                }
              })();
            }}
          />
          {item.status === 'active' ? (
            <QinButton
              label="停用此需求"
              variant="danger"
              onPress={() => {
                void deactivateStaffingRequirement(actor, item.id)
                  .then(() => router.back())
                  .catch((err) => setError(err instanceof Error ? err.message : '停用失敗'));
              }}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
