import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinDateField } from '@/components/ui/QinDateField';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { listTenants } from '@/repositories/tenantRepository';
import { registerAccount } from '@/services/authService';
import { getAppVersion, getDeviceId } from '@/services/sessionStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Gender, Tenant } from '@/types';
import { toDateOnly } from '@/utils/datetime';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    employeeNo: '',
    gender: 'unspecified' as Gender,
    hireDate: toDateOnly(new Date()),
    jobTitle: '',
    account: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void listTenants().then((items) => {
      setTenants(items);
      if (items[0]) {
        setTenantId(items[0].id);
      }
    });
  }, []);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginBottom: spacing.sm })}>
        註冊帳號
      </Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.lg })}>
        送出後狀態為待審核，需由主管開通後才能進入主要功能。
      </Text>
      {tenants.length === 0 ? (
        <InfoBanner message="目前尚未建立公司，請先完成系統初始化。" />
      ) : (
        <QinSelect
          label="所屬公司"
          value={tenantId}
          options={tenants.map((item) => ({ value: item.id, label: item.officialName }))}
          onChange={setTenantId}
        />
      )}
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
      <QinInput label="職稱" value={form.jobTitle} onChangeText={(v) => update('jobTitle', v)} />
      <QinInput label="帳號" value={form.account} onChangeText={(v) => update('account', v)} />
      <QinInput label="密碼" value={form.password} onChangeText={(v) => update('password', v)} secure />
      <QinInput label="再次確認密碼" value={form.confirmPassword} onChangeText={(v) => update('confirmPassword', v)} secure />
      <QinButton
        label="送出申請"
        loading={loading}
        disabled={tenants.length === 0}
        onPress={() => {
          void (async () => {
            setError(null);
            setLoading(true);
            try {
              const tenant = tenants.find((item) => item.id === tenantId);
              if (!tenant) {
                throw new Error('請選擇所屬公司');
              }
              await registerAccount(tenant, form, {
                userId: null,
                fullName: form.fullName,
                account: form.account,
                roleSnapshot: 'APPLICANT',
                tenantId: tenant.id,
                siteId: null,
                deviceId: await getDeviceId(),
                appVersion: await getAppVersion(),
              });
              router.replace('/(auth)/pending');
            } catch (err) {
              setError(err instanceof Error ? err.message : '註冊失敗');
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
