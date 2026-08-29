import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinCard } from '@/components/ui/QinCard';
import { QrCodeView } from '@/components/qr/QrCodeView';
import { useSession } from '@/providers/SessionProvider';
import { getEmployeeQrCard } from '@/services/qrAssetService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { QrAsset, User } from '@/types';

export default function MyQrScreen() {
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [asset, setAsset] = useState<QrAsset | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [sites, setSites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const card = await getEmployeeQrCard(actor);
    setUser(card.user);
    setAsset(card.asset);
    setCompanyName(card.companyName);
    setSites(card.authorizedSiteNames);
  }, [actor]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      {user ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Avatar uri={user.photoUri} name={user.fullName} size={72} />
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: spacing.sm })}>
            {user.fullName}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            {user.employeeNo ?? '—'} · {user.jobTitle ?? '—'}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
            {companyName ?? '—'}
          </Text>
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 4 })}>
            {sites.length ? `目前授權案場：${sites.join('、')}` : '尚未授權案場'}
          </Text>
        </QinCard>
      ) : null}
      {asset ? (
        <QinCard>
          <QrCodeView value={asset.qrCode} caption="永久人員 QR · 僅供識別，仍須登入與權限驗證" />
        </QinCard>
      ) : (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning })}>
          尚未由主管建立人員 QR
        </Text>
      )}
    </Screen>
  );
}
