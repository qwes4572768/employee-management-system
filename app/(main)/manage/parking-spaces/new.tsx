import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import {
  PARKING_SPACE_TYPE_LABELS,
  PARKING_VEHICLE_TYPE_LABELS,
  type ParkingSpaceType,
  type ParkingVehicleType,
} from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { createParkingSpaceForActor } from '@/services/parkingSpaceService';

const TYPE_OPTIONS = (Object.keys(PARKING_SPACE_TYPE_LABELS) as ParkingSpaceType[]).map((value) => ({
  value,
  label: PARKING_SPACE_TYPE_LABELS[value],
}));
const VEHICLE_OPTIONS = (Object.keys(PARKING_VEHICLE_TYPE_LABELS) as ParkingVehicleType[]).map((value) => ({
  value,
  label: PARKING_VEHICLE_TYPE_LABELS[value],
}));

export default function NewParkingSpaceScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [zone, setZone] = useState('');
  const [floor, setFloor] = useState('');
  const [spaceNo, setSpaceNo] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [spaceType, setSpaceType] = useState<ParkingSpaceType>('private');
  const [vehicleType, setVehicleType] = useState<ParkingVehicleType>('car');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect label="案場" value={siteId} options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))} onChange={setSiteId} />
      <QinInput label="區域（選填）" value={zone} onChangeText={setZone} placeholder="例如：B1" />
      <QinInput label="樓層（選填）" value={floor} onChangeText={setFloor} />
      <QinInput label="車位編號" value={spaceNo} onChangeText={setSpaceNo} placeholder="例如：01" />
      <QinInput label="顯示名稱（選填）" value={displayName} onChangeText={setDisplayName} />
      <QinSelect label="車位類型" value={spaceType} options={TYPE_OPTIONS} onChange={(value) => setSpaceType(value as ParkingSpaceType)} />
      <QinSelect label="適用車種" value={vehicleType} options={VEHICLE_OPTIONS} onChange={(value) => setVehicleType(value as ParkingVehicleType)} />
      <QinInput label="備註" value={notes} onChangeText={setNotes} multiline />
      <QinButton
        label="建立車位"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createParkingSpaceForActor(actor, { siteId, zone, floor, spaceNo, displayName, spaceType, vehicleType, notes })
            .then((item) => router.replace({ pathname: '/(main)/manage/parking-spaces/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
