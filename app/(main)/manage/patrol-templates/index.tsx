import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { useSession } from '@/providers/SessionProvider';
import { listPatrolTemplatesForActor } from '@/services/patrolTemplateService';
import type { PatrolTemplate } from '@/types';

export default function PatrolTemplatesScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const [rows, setRows] = useState<PatrolTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listPatrolTemplatesForActor(actor, currentSite?.id ?? null));
  }, [actor, currentSite?.id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {can('patrolTemplate.manage') ? (
        <QinButton label="新增巡邏模板" onPress={() => router.push('/(main)/manage/patrol-templates/new')} />
      ) : null}
      {rows.map((item) => (
        <ListRow
          key={item.id}
          title={item.name}
          subtitle={`${item.scheduleMode} · ${item.status === 'active' ? '啟用' : '停用'}`}
          onPress={() => router.push({ pathname: '/(main)/manage/patrol-templates/[id]', params: { id: item.id } })}
        />
      ))}
    </Screen>
  );
}
