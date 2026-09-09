import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinDateField } from '@/components/ui/QinDateField';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { getOnboardingDraft, patchOnboardingDraft } from '@/features/onboarding/draft';
import { validateAdminInput } from '@/services/bootstrapService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Gender } from '@/types';

export default function CreateAdminScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const initial = getOnboardingDraft().admin;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.accent, letterSpacing: 2 })}>
        STEP 01
      </Text>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: spacing.md })}>
        建立第一位總管理員
      </Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
        此帳號將成為平台初始化企業總管理員。請使用本人資料，系統不會預設 admin / 123456。
      </Text>
      <ErrorBanner message={error} />
      <QinInput label="姓名" value={form.fullName} onChangeText={(v) => update('fullName', v)} autoCapitalize="words" />
      <QinInput label="手機" value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
      <QinInput label="員工編號" value={form.employeeNo} onChangeText={(v) => update('employeeNo', v)} />
      <QinSelect
        label="性別"
        value={form.gender}
        options={[
          { value: 'male', label: '男性' },
          { value: 'female', label: '女性' },
          { value: 'unspecified', label: '不便透露' },
        ]}
        onChange={(v) => update('gender', v as Gender)}
      />
      <QinDateField label="到職日期" value={form.hireDate} onChange={(v) => update('hireDate', v)} />
      <QinInput label="職稱" value={form.jobTitle} onChangeText={(v) => update('jobTitle', v)} placeholder="例如：營運長" />
      <QinInput label="登入帳號" value={form.account} onChangeText={(v) => update('account', v)} autoCapitalize="none" />
      <QinInput label="密碼" value={form.password} onChangeText={(v) => update('password', v)} secure />
      <QinInput label="再次確認密碼" value={form.confirmPassword} onChangeText={(v) => update('confirmPassword', v)} secure />
      <QinButton
        label="下一步：公司資料"
        onPress={() => {
          const message = validateAdminInput(form);
          if (message) {
            setError(message);
            return;
          }
          patchOnboardingDraft({ admin: form });
          router.push('/(onboarding)/create-company');
        }}
      />
    </Screen>
  );
}
