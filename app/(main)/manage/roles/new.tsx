import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { createCustomRole } from '@/services/roleService';

export default function NewRoleScreen() {
  const router = useRouter();
  const { actor, tenant } = useSession();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="角色名稱" value={name} onChangeText={setName} />
      <QinInput label="說明" value={description} onChangeText={setDescription} multiline />
      <QinButton
        label="建立角色"
        loading={loading}
        onPress={() => {
          void (async () => {
            if (!tenant) return;
            setLoading(true);
            setError(null);
            try {
              const role = await createCustomRole(actor, { tenantId: tenant.id, name, description });
              router.replace(`/(main)/manage/roles/${role.id}`);
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
