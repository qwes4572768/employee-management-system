import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { MANAGED_KEY_TYPE_LABELS, type ManagedKeyType } from '@/constants/mobility';
import { useSession } from '@/providers/SessionProvider';
import { createManagedKeyForActor } from '@/services/keyService';

const TYPE_OPTIONS = (Object.keys(MANAGED_KEY_TYPE_LABELS) as ManagedKeyType[]).map((value) => ({
  value,
  label: MANAGED_KEY_TYPE_LABELS[value],
}));

export default function NewKeyScreen() {
  const router = useRouter();
  const { actor, authorizedSites, currentSite } = useSession();
  const [siteId, setSiteId] = useState(currentSite?.id ?? authorizedSites[0]?.id ?? '');
  const [keyCode, setKeyCode] = useState('');
  const [name, setName] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [keyType, setKeyType] = useState<ManagedKeyType>('physical');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect label="案場" value={siteId} options={authorizedSites.map((site) => ({ value: site.id, label: site.name }))} onChange={setSiteId} />
      <QinInput label="鑰匙代碼" value={keyCode} onChangeText={setKeyCode} placeholder="例如：KEY-ROOF" />
      <QinInput label="名稱" value={name} onChangeText={setName} placeholder="例如：頂樓鑰匙" />
      <QinSelect label="類型" value={keyType} options={TYPE_OPTIONS} onChange={(value) => setKeyType(value as ManagedKeyType)} />
      <QinInput label="存放位置" value={storageLocation} onChangeText={setStorageLocation} />
      <QinInput label="說明" value={description} onChangeText={setDescription} multiline />
      <QinButton
        label="建立鑰匙"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void createManagedKeyForActor(actor, { siteId, keyCode, name, storageLocation, keyType, description })
            .then((item) => router.replace({ pathname: '/(main)/manage/keys/[id]', params: { id: item.id } }))
            .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
