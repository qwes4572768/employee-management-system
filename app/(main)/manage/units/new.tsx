import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { OCCUPANCY_TYPE_LABELS, type OccupancyType } from '@/constants/community';
import { useSession } from '@/providers/SessionProvider';
import { createSiteUnit } from '@/services/unitService';

const OCCUPANCY_OPTIONS = (Object.keys(OCCUPANCY_TYPE_LABELS) as OccupancyType[]).map((value) => ({
  value,
  label: OCCUPANCY_TYPE_LABELS[value],
}));

export default function NewUnitScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [occupancyType, setOccupancyType] = useState<OccupancyType>('vacant');
  const [notes, setNotes] = useState('');
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
      <QinInput label="棟別（選填）" value={building} onChangeText={setBuilding} placeholder="例如：A棟" />
      <QinInput label="樓層（選填）" value={floor} onChangeText={setFloor} placeholder="例如：12" />
      <QinInput label="戶號" value={unitNo} onChangeText={setUnitNo} placeholder="例如：3" />
      <QinInput label="顯示名稱（選填）" value={displayName} onChangeText={setDisplayName} placeholder="空白則自動組成" />
      <QinSelect label="現況" value={occupancyType} options={OCCUPANCY_OPTIONS} onChange={setOccupancyType} />
      <QinInput label="備註" value={notes} onChangeText={setNotes} multiline />
      <QinButton
        label="建立戶別"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createSiteUnit(actor, {
            siteId,
            building,
            floor,
            unitNo,
            displayName,
            occupancyType,
            notes,
          })
            .then((item) => router.replace({ pathname: '/(main)/manage/units/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
