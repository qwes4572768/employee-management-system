import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useSession } from '@/providers/SessionProvider';
import { createShiftTemplate } from '@/services/scheduleService';

export default function NewShiftScreen() {
  const router = useRouter();
  const { actor, currentSite } = useSession();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('20:00');
  const [bindSite, setBindSite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="班別名稱" value={name} onChangeText={setName} placeholder="例如：日班" />
      <QinInput label="班別代碼" value={code} onChangeText={setCode} placeholder="DAY" />
      <QinInput label="開始時間 HH:mm" value={startTime} onChangeText={setStartTime} />
      <QinInput label="結束時間 HH:mm" value={endTime} onChangeText={setEndTime} />
      <SwitchRow label="綁定目前案場" value={bindSite} onValueChange={setBindSite} />
      <QinButton
        label="建立班別"
        loading={loading}
        onPress={() => {
          void (async () => {
            setLoading(true);
            setError(null);
            try {
              await createShiftTemplate(actor, {
                name,
                code,
                startTime,
                endTime,
                siteId: bindSite ? currentSite?.id ?? null : null,
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
