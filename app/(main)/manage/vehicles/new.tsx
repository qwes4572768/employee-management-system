import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { RESIDENT_VEHICLE_TYPE_LABELS, type ResidentVehicleType } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { listResidentsForActor } from '@/services/residentService';
import { listSiteUnitsForActor } from '@/services/unitService';
import { createResidentVehicleForActor } from '@/services/vehicleService';
import type { Resident, SiteUnit } from '@/types';

const TYPE_OPTIONS = (Object.keys(RESIDENT_VEHICLE_TYPE_LABELS) as ResidentVehicleType[]).map((value) => ({
  value,
  label: RESIDENT_VEHICLE_TYPE_LABELS[value],
}));

export default function NewVehicleScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [units, setUnits] = useState<SiteUnit[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [unitId, setUnitId] = useState('');
  const [residentId, setResidentId] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [vehicleType, setVehicleType] = useState<ResidentVehicleType>('car');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listSiteUnitsForActor(actor, siteId)
      .then((rows) => {
        setUnits(rows);
        setUnitId((current) => current || rows[0]?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '讀取戶別失敗'));
  }, [actor, siteId]);

  useEffect(() => {
    if (!unitId) {
      setResidents([]);
      return;
    }
    void listResidentsForActor(actor, { unitId, status: 'active' })
      .then(setResidents)
      .catch((err) => setError(err instanceof Error ? err.message : '讀取住戶失敗'));
  }, [actor, unitId]);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect label="案場" value={siteId} options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))} onChange={setSiteId} />
      <QinSelect
        label="戶別（選填）"
        value={unitId}
        options={[{ value: '', label: '臨時登記，不掛戶別' }, ...units.map((item) => ({ value: item.id, label: item.displayName }))]}
        onChange={setUnitId}
      />
      <QinSelect
        label="住戶（選填）"
        value={residentId}
        options={[{ value: '', label: '未指定住戶' }, ...residents.map((item) => ({ value: item.id, label: item.fullName }))]}
        onChange={setResidentId}
      />
      <QinInput label="車牌" value={plateNo} onChangeText={setPlateNo} autoCapitalize="characters" />
      <QinSelect label="車種" value={vehicleType} options={TYPE_OPTIONS} onChange={(value) => setVehicleType(value as ResidentVehicleType)} />
      <QinInput label="廠牌" value={brand} onChangeText={setBrand} />
      <QinInput label="型號" value={model} onChangeText={setModel} />
      <QinInput label="顏色" value={color} onChangeText={setColor} />
      <QinInput label="備註／共用原因" value={notes} onChangeText={setNotes} multiline />
      <QinButton
        label="建立車輛"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createResidentVehicleForActor(actor, {
            siteId,
            unitId: unitId || null,
            residentId: residentId || null,
            plateNo,
            vehicleType,
            brand,
            model,
            color,
            notes,
          })
            .then((item) => router.replace({ pathname: '/(main)/manage/vehicles/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
