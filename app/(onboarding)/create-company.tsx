import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { INDUSTRY_OPTIONS } from '@/constants/app';
import { getOnboardingDraft, patchOnboardingDraft } from '@/features/onboarding/draft';
import { validateCompanyInput } from '@/services/bootstrapService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function CreateCompanyScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const [form, setForm] = useState(getOnboardingDraft().company);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, letterSpacing: 2 })}>
        STEP 02
      </Text>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: spacing.md })}>
        建立公司資料
      </Text>
      <ErrorBanner message={error} />
      <QinInput label="公司正式名稱" value={form.officialName} onChangeText={(v) => update('officialName', v)} autoCapitalize="words" />
      <QinInput label="公司簡稱" value={form.shortName} onChangeText={(v) => update('shortName', v)} />
      <QinInput label="統一編號" value={form.taxId} onChangeText={(v) => update('taxId', v)} keyboardType="number-pad" />
      <QinInput label="公司電話" value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
      <QinInput label="地址" value={form.address} onChangeText={(v) => update('address', v)} />
      <QinSelect
        label="產業類型"
        value={form.industryType}
        options={INDUSTRY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
        onChange={(v) => update('industryType', v)}
      />
      <QinButton
        label="下一步：第一個案場"
        onPress={() => {
          const message = validateCompanyInput(form);
          if (message) {
            setError(message);
            return;
          }
          patchOnboardingDraft({ company: form });
          router.push('/(onboarding)/create-site');
        }}
      />
    </Screen>
  );
}
