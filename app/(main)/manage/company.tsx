import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { INDUSTRY_OPTIONS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { editTenant } from '@/services/tenantService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function CompanyScreen() {
  const { tenant, actor, can, refresh } = useSession();
  const { colors, fontScale } = useTheme();
  const [form, setForm] = useState({
    officialName: tenant?.officialName ?? '',
    shortName: tenant?.shortName ?? '',
    taxId: tenant?.taxId ?? '',
    phone: tenant?.phone ?? '',
    address: tenant?.address ?? '',
    industryType: tenant?.industryType ?? 'security',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tenant) {
      setForm({
        officialName: tenant.officialName,
        shortName: tenant.shortName,
        taxId: tenant.taxId ?? '',
        phone: tenant.phone ?? '',
        address: tenant.address ?? '',
        industryType: tenant.industryType ?? 'security',
      });
    }
  }, [tenant]);

  if (!tenant) {
    return (
      <Screen>
        <Text style={textStyle(colors, fontScale, 'md')}>找不到公司資料</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="公司正式名稱" value={form.officialName} onChangeText={(v) => setForm({ ...form, officialName: v })} editable={can('tenants.update')} />
      <QinInput label="公司簡稱" value={form.shortName} onChangeText={(v) => setForm({ ...form, shortName: v })} editable={can('tenants.update')} />
      <QinInput label="統一編號" value={form.taxId} onChangeText={(v) => setForm({ ...form, taxId: v })} editable={can('tenants.update')} />
      <QinInput label="公司電話" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} editable={can('tenants.update')} />
      <QinInput label="地址" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} editable={can('tenants.update')} />
      <QinSelect
        label="產業類型"
        value={form.industryType}
        options={INDUSTRY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
        onChange={(v) => setForm({ ...form, industryType: v })}
      />
      {can('tenants.update') ? (
        <QinButton
          label="儲存"
          loading={loading}
          onPress={() => {
            void (async () => {
              setLoading(true);
              setError(null);
              try {
                await editTenant(actor, tenant.id, form);
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : '儲存失敗');
              } finally {
                setLoading(false);
              }
            })();
          }}
        />
      ) : (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md })}>
          你沒有修改公司資料的權限。
        </Text>
      )}
    </Screen>
  );
}
