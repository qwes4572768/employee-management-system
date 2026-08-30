import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useSession } from '@/providers/SessionProvider';
import { getShiftTemplates } from '@/services/scheduleService';
import { createPatrolTemplate } from '@/services/patrolTemplateService';
import { toDateOnly } from '@/utils/datetime';

export default function NewPatrolTemplateScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [shifts, setShifts] = useState<Array<{ id: string; name: string }>>([]);
  const [startDate, setStartDate] = useState(toDateOnly(new Date()));
  const [allowLate, setAllowLate] = useState(false);
  const [enforce, setEnforce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getShiftTemplates(actor, siteId || null).then((items) =>
        setShifts(items.map((item) => ({ id: item.id, name: `${item.name} ${item.startTime}～${item.endTime}` }))),
      );
    }, [actor, siteId]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="案場"
        value={siteId}
        options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))}
        onChange={setSiteId}
      />
      <QinInput label="模板名稱" value={name} onChangeText={setName} placeholder="例如：夜班第一輪" />
      <QinInput label="說明" value={description} onChangeText={setDescription} placeholder="例如：22:00–00:00" />
      <QinSelect
        label="綁定班別（選填）"
        value={shiftId}
        options={[{ value: '', label: '不限班別' }, ...shifts.map((item) => ({ value: item.id, label: item.name }))]}
        onChange={setShiftId}
      />
      <QinInput label="生效日 YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />
      <SwitchRow label="允許逾時補巡" value={allowLate} onValueChange={setAllowLate} />
      <SwitchRow label="強制依序巡邏" value={enforce} onValueChange={setEnforce} />
      <QinButton
        label="建立模板"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createPatrolTemplate(actor, {
            siteId,
            name,
            description,
            shiftTemplateId: shiftId || null,
            effectiveStartDate: startDate,
            allowLatePatrol: allowLate,
            enforceSequence: enforce,
          })
            .then((item) => router.replace({ pathname: '/(main)/manage/patrol-templates/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
