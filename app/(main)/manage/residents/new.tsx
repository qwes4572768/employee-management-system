import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { GENDER_LABELS } from '@/constants/app';
import { RESIDENT_RELATION_LABELS, type ResidentRelationKey } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { createResidentWithOccupancy } from '@/services/residentService';
import { listSiteUnitsForActor } from '@/services/unitService';
import type { SiteUnit } from '@/types';

const RELATION_OPTIONS = (Object.keys(RESIDENT_RELATION_LABELS) as ResidentRelationKey[]).map((value) => ({
  value,
  label: RESIDENT_RELATION_LABELS[value],
}));
const GENDER_OPTIONS = Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }));

export default function NewResidentScreen() {
  const router = useRouter();
  const { unitId: presetUnitId } = useLocalSearchParams<{ unitId?: string }>();
  const { actor, currentSite } = useSession();
  const [units, setUnits] = useState<SiteUnit[]>([]);
  const [unitId, setUnitId] = useState(presetUnitId ?? '');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('unspecified');
  const [idLast4, setIdLast4] = useState('');
  const [relationKey, setRelationKey] = useState<ResidentRelationKey>('owner');
  const [isPrimary, setIsPrimary] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listSiteUnitsForActor(actor, currentSite?.id ?? null)
      .then((rows) => {
        setUnits(rows);
        setUnitId((current) => current || presetUnitId || rows[0]?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '讀取戶別失敗'));
  }, [actor, currentSite?.id, presetUnitId]);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="戶別"
        value={unitId}
        options={units.map((item) => ({ value: item.id, label: item.displayName }))}
        onChange={setUnitId}
      />
      <QinInput label="姓名" value={fullName} onChangeText={setFullName} />
      <QinInput label="電話" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <QinSelect label="性別" value={gender} options={GENDER_OPTIONS} onChange={setGender} />
      <QinInput label="身分證末四碼（選填）" value={idLast4} onChangeText={setIdLast4} keyboardType="number-pad" />
      <QinSelect label="關係" value={relationKey} options={RELATION_OPTIONS} onChange={setRelationKey} />
      <SwitchRow label="此戶主要聯絡人" value={isPrimary} onValueChange={setIsPrimary} />
      <QinInput label="備註" value={notes} onChangeText={setNotes} multiline />
      <QinButton
        label="建立住戶"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createResidentWithOccupancy(actor, {
            unitId,
            fullName,
            phone,
            gender,
            idLast4,
            isPrimary,
            notes,
            relationKey,
          })
            .then(({ resident }) => router.replace({ pathname: '/(main)/manage/residents/[id]', params: { id: resident.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
