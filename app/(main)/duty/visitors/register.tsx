import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { VISITOR_KIND_LABELS, type VisitorKind } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { listResidentsForActor } from '@/services/residentService';
import { listSiteUnitsForActor } from '@/services/unitService';
import { registerVisitorPass } from '@/services/visitorService';
import type { Resident, SiteUnit } from '@/types';

const KIND_OPTIONS = (Object.keys(VISITOR_KIND_LABELS) as VisitorKind[]).map((value) => ({
  value,
  label: VISITOR_KIND_LABELS[value],
}));

export default function DutyVisitorRegisterScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [units, setUnits] = useState<SiteUnit[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [unitId, setUnitId] = useState('');
  const [hostResidentId, setHostResidentId] = useState('');
  const [visitorKind, setVisitorKind] = useState<VisitorKind>('guest');
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorCompany, setVisitorCompany] = useState('');
  const [idLast4, setIdLast4] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const siteUnits = await listSiteUnitsForActor(actor, currentSite?.id ?? null);
      setUnits(siteUnits);
      setUnitId((current) => current || siteUnits[0]?.id || '');
      const people = await listResidentsForActor(actor, { siteId: currentSite?.id ?? null, status: 'active' });
      setResidents(people);
    })().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
  }, [actor, currentSite?.id]);

  const hostOptions = [
    { value: '', label: '未指定受訪住戶' },
    ...residents
      .filter((item) => !unitId || item.unitId === unitId)
      .map((item) => ({ value: item.id, label: item.fullName })),
  ];

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="戶別"
        value={unitId}
        options={units.map((item) => ({ value: item.id, label: item.displayName }))}
        onChange={setUnitId}
      />
      <QinSelect label="受訪住戶（選填）" value={hostResidentId} options={hostOptions} onChange={setHostResidentId} />
      <QinSelect label="種類" value={visitorKind} options={KIND_OPTIONS} onChange={setVisitorKind} />
      <QinInput label="姓名" value={visitorName} onChangeText={setVisitorName} />
      <QinInput label="電話" value={visitorPhone} onChangeText={setVisitorPhone} keyboardType="phone-pad" />
      <QinInput
        label={visitorKind === 'guest' ? '單位（選填）' : '廠商／外送／所屬單位'}
        value={visitorCompany}
        onChangeText={setVisitorCompany}
      />
      <QinInput label="身分證末四碼（選填）" value={idLast4} onChangeText={setIdLast4} keyboardType="number-pad" />
      <QinInput label="事由" value={purpose} onChangeText={setPurpose} />
      <QinButton
        label="完成登記"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void registerVisitorPass(actor, {
            siteId: currentSite?.id,
            unitId,
            hostResidentId: hostResidentId || null,
            visitorKind,
            visitorName,
            visitorPhone,
            visitorCompany,
            idLast4,
            purpose,
          })
            .then((item) => router.replace({ pathname: '/(main)/duty/visitors/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '登記失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
