import { useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { GENDER_LABELS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { logout } from '@/services/authService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';

export default function MeHome() {
  const router = useRouter();
  const { user, tenant, roles, actor, refresh } = useSession();
  const { colors, fontScale } = useTheme();

  if (!user) {
    return null;
  }

  return (
    <Screen>
      <QinCard style={{ marginBottom: spacing.lg, alignItems: 'flex-start' }}>
        <Avatar uri={user.photoUri} name={user.fullName} size={72} />
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: spacing.md })}>
          {user.fullName}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
          {tenant?.officialName ?? ''} · {roles.map((r) => r.name).join('、')}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
          {GENDER_LABELS[user.gender]} · {user.jobTitle ?? '—'} · 到職 {formatDateZh(user.hireDate)}
        </Text>
      </QinCard>
      <ListRow title="個人資料" subtitle="照片、姓名、手機、員工編號、性別、到職日、職稱" onPress={() => router.push('/(main)/me/profile')} />
      <ListRow title="修改密碼" subtitle="密碼變更走獨立流程" onPress={() => router.push('/(main)/me/password')} />
      <ListRow title="顯示設定" subtitle="主題、文字大小" onPress={() => router.push('/(main)/me/appearance')} />
      <QinButton
        label="登出"
        variant="secondary"
        style={{ marginTop: spacing.lg }}
        onPress={() => {
          Alert.alert('登出', '確定要登出勤管系統？', [
            { text: '取消', style: 'cancel' },
            {
              text: '登出',
              style: 'destructive',
              onPress: () => {
                void logout(actor).then(async () => {
                  await refresh();
                  router.replace('/(auth)/login');
                });
              },
            },
          ]);
        }}
      />
    </Screen>
  );
}
