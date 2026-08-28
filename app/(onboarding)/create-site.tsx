import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton, ButtonRow } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { getOnboardingDraft, patchOnboardingDraft, resetOnboardingDraft } from '@/features/onboarding/draft';
import { useSession } from '@/providers/SessionProvider';
import { bootstrapSystem } from '@/services/bootstrapService';
import { getAppVersion, getDeviceId } from '@/services/sessionStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function CreateSiteScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const { refresh } = useSession();
  const [form, setForm] = useState(getOnboardingDraft().site);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const finish = async (includeSite: boolean) => {
    setError(null);
    setLoading(true);
    try {
      patchOnboardingDraft({ site: form });
      const draft = getOnboardingDraft();
      const deviceId = await getDeviceId();
      const appVersion = await getAppVersion();
      await bootstrapSystem({
        admin: draft.admin,
        company: draft.company,
        site: includeSite
          ? {
              siteCode: draft.site.siteCode,
              name: draft.site.name,
              address: draft.site.address,
              attendanceRadius: draft.site.attendanceRadius ? Number(draft.site.attendanceRadius) : null,
              requireGps: draft.site.requireGps,
              requireSiteQr: draft.site.requireSiteQr,
            }
          : null,
        actor: {
          userId: null,
          fullName: draft.admin.fullName,
          account: draft.admin.account,
          roleSnapshot: 'SUPER_ADMIN',
          tenantId: null,
          siteId: null,
          deviceId,
          appVersion,
        },
      });
      resetOnboardingDraft();
      await refresh();
      router.replace('/(main)');
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, letterSpacing: 2 })}>
        STEP 03
      </Text>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: spacing.md })}>
        建立第一個案場
      </Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
        可先建立第一個案場，或稍後再從管理功能新增。
      </Text>
      <ErrorBanner message={error} />
      <QinInput label="案場代碼" value={form.siteCode} onChangeText={(v) => update('siteCode', v)} placeholder="例如 SITE-001" />
      <QinInput label="案場名稱" value={form.name} onChangeText={(v) => update('name', v)} />
      <QinInput label="地址" value={form.address} onChangeText={(v) => update('address', v)} />
      <QinInput
        label="出勤半徑（公尺，選填）"
        value={form.attendanceRadius}
        onChangeText={(v) => update('attendanceRadius', v)}
        keyboardType="decimal-pad"
      />
      <SwitchRow label="未來需要 GPS 打卡" value={form.requireGps} onValueChange={(v) => update('requireGps', v)} />
      <SwitchRow label="未來需要案場 QR" value={form.requireSiteQr} onValueChange={(v) => update('requireSiteQr', v)} />
      <ButtonRow>
        <QinButton label="完成並進入首頁" loading={loading} onPress={() => void finish(Boolean(form.name && form.siteCode))} />
        <QinButton label="稍後再建立案場" variant="secondary" disabled={loading} onPress={() => void finish(false)} />
      </ButtonRow>
    </Screen>
  );
}
