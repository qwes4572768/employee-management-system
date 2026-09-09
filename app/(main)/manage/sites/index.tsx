import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { SITE_STATUS_LABELS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { listSites } from '@/repositories/siteRepository';
import type { Site } from '@/types';

export default function SitesScreen() {
  const router = useRouter();
  const { tenant, can } = useSession();
  const [sites, setSites] = useState<Site[]>([]);

  const load = useCallback(async () => {
    if (!tenant) {
      return;
    }
    setSites(await listSites(tenant.id));
  }, [tenant]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      {can('sites.create') ? (
        <QinButton label="新增案場" onPress={() => router.push('/(main)/manage/sites/new')} style={{ marginBottom: 16 }} />
      ) : null}
      {sites.length === 0 ? (
        <EmptyState
          title="尚未建立案場"
          subtitle="建立第一個案場後即可開始設定勤務"
          icon="business-outline"
          actionLabel={can('sites.create') ? '建立第一個案場' : undefined}
          onAction={can('sites.create') ? () => router.push('/(main)/manage/sites/new') : undefined}
        />
      ) : (
        sites.map((site) => (
          <ListRow
            key={site.id}
            title={site.name}
            subtitle={`${site.siteCode}${site.address ? ` · ${site.address}` : ''}`}
            meta={SITE_STATUS_LABELS[site.status]}
            onPress={() => router.push(`/(main)/manage/sites/${site.id}`)}
          />
        ))
      )}
    </Screen>
  );
}
