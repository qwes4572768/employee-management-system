import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { useSession } from '@/providers/SessionProvider';
import { login } from '@/services/authService';
import { getAppVersion, getDeviceId } from '@/services/sessionStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const { colors, fontScale } = useTheme();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, letterSpacing: 3 })}>
        QINGUAN
      </Text>
      <Text style={textStyle(colors, fontScale, 'hero', { fontWeight: '800', marginTop: 8 })}>登入</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg, marginTop: 6 })}>
        使用已開通的帳號進入勤管系統。
      </Text>
      <ErrorBanner message={error} />
      {info ? <InfoBanner message={info} /> : null}
      <QinInput label="帳號" value={account} onChangeText={setAccount} autoCapitalize="none" />
      <QinInput label="密碼" value={password} onChangeText={setPassword} secure />
      <QinButton
        label="登入"
        loading={loading}
        onPress={() => {
          void (async () => {
            setError(null);
            setInfo(null);
            setLoading(true);
            try {
              const actor = {
                userId: null,
                fullName: '未驗證使用者',
                account,
                roleSnapshot: 'UNAUTHENTICATED',
                tenantId: null,
                siteId: null,
                deviceId: await getDeviceId(),
                appVersion: await getAppVersion(),
              };
              await login(account, password, actor);
              await refresh();
              router.replace('/(main)');
            } catch (err) {
              const code = (err as { code?: string }).code;
              const message = err instanceof Error ? err.message : '登入失敗';
              if (code === 'PENDING' || code === 'RETURNED' || code === 'REJECTED' || code === 'SUSPENDED') {
                setInfo(message);
                if (code === 'RETURNED') {
                  router.push({ pathname: '/(auth)/returned', params: { account } });
                }
              } else {
                setError(message);
              }
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.lg })}>
        還沒有帳號？ <Link href="/(auth)/register" style={{ color: colors.accent }}>註冊帳號</Link>
      </Text>
    </Screen>
  );
}
