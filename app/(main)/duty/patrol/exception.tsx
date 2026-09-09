import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { PATROL_EXCEPTION_CATEGORIES, PATROL_EXCEPTION_SEVERITIES } from '@/constants/patrol';
import { useSession } from '@/providers/SessionProvider';
import { createPatrolException } from '@/services/patrolExceptionService';
import { requirePatrolTaskPoint } from '@/services/patrolTaskService';
import { capturePatrolPhoto } from '@/utils/patrolPhoto';
import { savePatrolPhoto } from '@/services/patrolCheckService';

export default function PatrolExceptionScreen() {
  const router = useRouter();
  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { actor } = useSession();
  const [category, setCategory] = useState<(typeof PATROL_EXCEPTION_CATEGORIES)[number]['value']>('other');
  const [severity, setSeverity] = useState<(typeof PATROL_EXCEPTION_SEVERITIES)[keyof typeof PATROL_EXCEPTION_SEVERITIES]>(
    PATROL_EXCEPTION_SEVERITIES.GENERAL,
  );
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinSelect
        label="異常類型"
        value={category}
        options={PATROL_EXCEPTION_CATEGORIES.map((item) => ({ value: item.value, label: item.label }))}
        onChange={setCategory}
      />
      <QinSelect
        label="嚴重度"
        value={severity}
        options={[
          { value: 'general', label: '一般' },
          { value: 'important', label: '重要' },
          { value: 'urgent', label: '緊急' },
          { value: 'major', label: '重大' },
        ]}
        onChange={(value) => setSeverity(value as typeof severity)}
      />
      <QinInput label="說明" value={description} onChangeText={setDescription} />
      <QinButton
        label={photoUri ? '已拍攝異常照片' : '拍攝異常照片'}
        variant="secondary"
        onPress={() => {
          void capturePatrolPhoto()
            .then((uri) => setPhotoUri(uri))
            .catch((err) => setError(err instanceof Error ? err.message : '拍照失敗'));
        }}
      />
      <QinButton
        label="送出異常"
        loading={busy}
        onPress={() => {
          if (!pointId) return;
          setBusy(true);
          void (async () => {
            const point = await requirePatrolTaskPoint(pointId, actor.tenantId ?? '');
            const created = await createPatrolException(actor, {
              taskId: point.patrolTaskId,
              taskPointId: point.id,
              category,
              severity,
              description,
            });
            if (photoUri) {
              await savePatrolPhoto(actor, { taskPointId: point.id, localUri: photoUri });
            }
            void created;
            router.back();
          })()
            .catch((err) => setError(err instanceof Error ? err.message : '回報失敗'))
            .finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
