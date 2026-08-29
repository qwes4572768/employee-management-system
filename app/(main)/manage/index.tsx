import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ListRow } from '@/components/ui/ListRow';
import { useSession } from '@/providers/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

export default function ManageHome() {
  const router = useRouter();
  const { can } = useSession();
  const { colors, fontScale } = useTheme();
  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        僅顯示你目前有權使用的管理功能。
      </Text>
      {can('tenants.view') ? (
        <ListRow title="公司資料" subtitle="檢視與修改公司基本資料" onPress={() => router.push('/(main)/manage/company')} />
      ) : null}
      {can('sites.view') ? (
        <ListRow title="案場管理" subtitle="新增、修改、停用與封存案場" onPress={() => router.push('/(main)/manage/sites')} />
      ) : null}
      {can('users.view') ? (
        <ListRow title="帳號管理" subtitle="人員、角色與案場授權" onPress={() => router.push('/(main)/manage/accounts')} />
      ) : null}
      {can('accounts.view') || can('accounts.approve') ? (
        <ListRow title="帳號審核" subtitle="核准、退回或拒絕註冊申請" onPress={() => router.push('/(main)/manage/approvals')} />
      ) : null}
      {can('roles.view') || can('permissions.view') ? (
        <ListRow title="角色權限" subtitle="修改角色名稱與權限" onPress={() => router.push('/(main)/manage/roles')} />
      ) : null}
      {can('audit.view') ? (
        <ListRow title="操作日誌" subtitle="完整紀錄操作者姓名與時間" onPress={() => router.push('/(main)/manage/audit')} />
      ) : null}
      {can('schedule.view') || can('schedule.create') ? (
        <ListRow title="班別設定" subtitle="建立可自由命名的班別樣板" onPress={() => router.push('/(main)/manage/shifts')} />
      ) : null}
      {can('schedule.view') || can('schedule.create') ? (
        <ListRow title="智慧排班" subtitle="撞班、休息不足、見習重疊與批次複製" onPress={() => router.push('/(main)/manage/schedules')} />
      ) : null}
      {can('attendance.correct.approve') ? (
        <ListRow title="補卡審核" subtitle="核准或拒絕出勤更正" onPress={() => router.push('/(main)/manage/corrections')} />
      ) : null}
      {can('leave.view') || can('leave.approve') ? (
        <ListRow title="請假審核" subtitle="假勤核准、補件與人力影響" onPress={() => router.push('/(main)/manage/leave-review')} />
      ) : null}
      {can('leave.policy.manage') || can('leave.policy.view') ? (
        <ListRow title="勤務與假勤設定" subtitle="休息、遲到寬限與請假政策" onPress={() => router.push('/(main)/manage/workforce')} />
      ) : null}
      {can('staffingRequirement.view') || can('staffingRequirement.manage') ? (
        <ListRow title="人力需求" subtitle="設定案場班別最低勤務人數" onPress={() => router.push('/(main)/manage/staffing-requirements')} />
      ) : null}
      {can('qrAsset.view') || can('qrAsset.create') ? (
        <ListRow title="QR 資產中心" subtitle="建立與管理永久人員／案場 QR" onPress={() => router.push('/(main)/manage/qr-assets')} />
      ) : null}
    </Screen>
  );
}
