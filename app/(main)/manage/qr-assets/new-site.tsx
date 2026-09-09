import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { useSession } from '@/providers/SessionProvider';
import { listSites } from '@/repositories/siteRepository';
import { issueSiteQr } from '@/services/qrAssetService';
import type { Site } from '@/types';

export default function NewSiteQrScreen() {
  const router = useRouter();
  const { actor, tenant } = useSession();
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!tenant) return;
      void listSites(tenant.id).then(setSites);
    }, [tenant]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {sites.map((site) => (
        <ListRow
          key={site.id}
          title={site.name}
          subtitle={site.siteCode}
          onPress={() => {
            if (busyId) return;
            setBusyId(site.id);
            void issueSiteQr(actor, site.id)
              .then((asset) => router.replace({ pathname: '/(main)/manage/qr-assets/[id]', params: { id: asset.id } }))
              .catch((err) => setError(err instanceof Error ? err.message : '建立失敗'))
              .finally(() => setBusyId(null));
          }}
        />
      ))}
    </Screen>
  );
}
