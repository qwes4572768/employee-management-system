import { useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinDateField } from '@/components/ui/QinDateField';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { useSession } from '@/providers/SessionProvider';
import { changeOwnProfile } from '@/services/authService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Gender } from '@/types';
import { pickAndStorePhoto } from '@/utils/photo';

export default function ProfileScreen() {
  const { user, actor, refresh } = useSession();
  const { colors, fontScale } = useTheme();
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    employeeNo: user?.employeeNo ?? '',
    gender: (user?.gender ?? 'unspecified') as Gender,
    hireDate: user?.hireDate ?? '',
    jobTitle: user?.jobTitle ?? '',
    photoUri: user?.photoUri ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <Screen>
      <Avatar uri={form.photoUri} name={form.fullName || user.fullName} size={84} />
      <QinButton
        label="更換照片"
        variant="secondary"
        style={{ marginVertical: spacing.md }}
        onPress={() => {
          void pickAndStorePhoto()
            .then((uri) => {
              if (uri) setForm((prev) => ({ ...prev, photoUri: uri }));
            })
            .catch((err) => setError(err instanceof Error ? err.message : '無法選取照片'));
        }}
      />
      <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginBottom: spacing.md })}>
        所屬公司由系統管理，無法在此修改。密碼請走「修改密碼」。
      </Text>
      <ErrorBanner message={error} />
      <QinInput label="姓名" value={form.fullName} onChangeText={(v) => setForm({ ...form, fullName: v })} />
      <QinInput label="手機" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
      <QinInput label="員工編號" value={form.employeeNo} onChangeText={(v) => setForm({ ...form, employeeNo: v })} />
      <QinSelect
        label="性別"
        value={form.gender}
        options={[
          { value: 'male', label: '男性' },
          { value: 'female', label: '女性' },
          { value: 'unspecified', label: '不便透露' },
        ]}
        onChange={(v) => setForm({ ...form, gender: v as Gender })}
      />
      <QinDateField label="到職日期" value={form.hireDate} onChange={(v) => setForm({ ...form, hireDate: v })} />
      <QinInput label="職稱" value={form.jobTitle} onChangeText={(v) => setForm({ ...form, jobTitle: v })} />
      <QinButton
        label="儲存"
        loading={loading}
        onPress={() => {
          void (async () => {
            setLoading(true);
            setError(null);
            try {
              await changeOwnProfile(actor, user.id, form);
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : '儲存失敗');
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
