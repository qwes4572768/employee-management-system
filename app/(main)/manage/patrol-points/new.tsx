import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useSession } from '@/providers/SessionProvider';
import { createPatrolPoint } from '@/services/patrolPointService';

export default function NewPatrolPointScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('30');
  const [requireQr, setRequireQr] = useState(true);
  const [requireGps, setRequireGps] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="案場"
        value={siteId}
        options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))}
        onChange={setSiteId}
      />
      <QinInput label="名稱" value={name} onChangeText={setName} placeholder="例如：消防機房" />
      <QinInput label="代碼" value={code} onChangeText={setCode} placeholder="例如：PP-FIRE" />
      <QinInput label="說明" value={description} onChangeText={setDescription} />
      <QinInput label="位置備註" value={locationNote} onChangeText={setLocationNote} />
      <QinInput label="緯度（選填）" value={latitude} onChangeText={setLatitude} />
      <QinInput label="經度（選填）" value={longitude} onChangeText={setLongitude} />
      <QinInput label="GPS 允許公尺" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
      <SwitchRow label="需要掃 QR" value={requireQr} onValueChange={setRequireQr} />
      <SwitchRow label="需要 GPS" value={requireGps} onValueChange={setRequireGps} />
      <SwitchRow label="需要現場照片" value={requirePhoto} onValueChange={setRequirePhoto} />
      <QinButton
        label="建立巡邏點"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createPatrolPoint(actor, {
            siteId,
            name,
            code,
            description,
            locationNote,
            latitude: latitude ? Number(latitude) : null,
            longitude: longitude ? Number(longitude) : null,
            gpsRadiusMeters: radius ? Number(radius) : null,
            requireQr,
            requireGps,
            requirePhoto,
          })
            .then((item) => router.replace({ pathname: '/(main)/manage/patrol-points/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
