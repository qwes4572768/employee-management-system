import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { STAFFING_MODE_LABELS } from '@/constants/staffing';
import { useSession } from '@/providers/SessionProvider';
import { listSites } from '@/repositories/siteRepository';
import { getShiftTemplates } from '@/services/scheduleService';
import { createStaffingRequirement } from '@/services/staffingRequirementService';
import { toDateOnly } from '@/utils/datetime';
import type { Site } from '@/types';

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

export default function NewStaffingRequirementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ siteId?: string }>();
  const { actor, currentSite } = useSession();
  const [sites, setSites] = useState<Site[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [siteId, setSiteId] = useState(params.siteId || currentSite?.id || '');
  const [templateId, setTemplateId] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [startDate, setStartDate] = useState(toDateOnly(new Date()));
  const [endDate, setEndDate] = useState('');
  const [staffingMode, setStaffingMode] = useState('');
  const [weekday, setWeekday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void listSites(actor.tenantId ?? '').then(setSites);
  }, [actor.tenantId]);

  useEffect(() => {
    void getShiftTemplates(actor, siteId || null).then((items) =>
      setTemplates(items.map((item) => ({ id: item.id, name: `${item.name}（${item.startTime}～${item.endTime}）` }))),
    );
  }, [actor, siteId]);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="案場"
        value={siteId}
        options={sites.map((site) => ({ value: site.id, label: site.name }))}
        onChange={setSiteId}
      />
      <QinSelect
        label="班別"
        value={templateId}
        options={[{ value: '', label: '不限班別（案場預設）' }, ...templates.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={setTemplateId}
      />
      <QinInput label="最低勤務人數" value={headcount} onChangeText={setHeadcount} keyboardType="number-pad" placeholder="例如：3" />
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
      <QinSelect label="僅套用星期（選填，未來可擴充假日）" value={weekday} options={WEEKDAY_OPTIONS} onChange={setWeekday} />
      <QinButton
        label="建立人力需求"
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
              await createStaffingRequirement(actor, {
                siteId,
                shiftTemplateId: templateId || null,
                requiredHeadcount: parsed,
                effectiveStartDate: startDate,
                effectiveEndDate: endDate.trim() || null,
                staffingMode: staffingMode ? (staffingMode as 'fixed' | 'mobile' | 'trainee') : null,
                weekday: weekday === '' ? null : Number(weekday),
              });
              router.back();
            } catch (err) {
              setError(err instanceof Error ? err.message : '建立失敗');
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
