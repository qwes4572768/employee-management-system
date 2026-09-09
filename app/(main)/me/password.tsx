import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { changeOwnPassword } from '@/services/authService';

export default function PasswordScreen() {
  const { actor, user } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <Screen>
      <ErrorBanner message={error} />
      {ok ? <InfoBanner message="密碼已更新" /> : null}
      <QinInput label="目前密碼" value={currentPassword} onChangeText={setCurrentPassword} secure />
      <QinInput label="新密碼" value={nextPassword} onChangeText={setNextPassword} secure />
      <QinInput label="再次確認新密碼" value={confirmPassword} onChangeText={setConfirmPassword} secure />
      <QinButton
        label="更新密碼"
        loading={loading}
        onPress={() => {
          void (async () => {
            setLoading(true);
            setError(null);
            setOk(false);
            try {
              await changeOwnPassword(actor, user.id, currentPassword, nextPassword, confirmPassword);
              setCurrentPassword('');
              setNextPassword('');
              setConfirmPassword('');
              setOk(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : '更新失敗');
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
