import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinSelect } from '@/components/ui/QinSelect';
import { useSession } from '@/providers/SessionProvider';
import { listSites } from '@/repositories/siteRepository';
import { getShiftTemplates } from '@/services/scheduleService';
import { listStaffingRequirements } from '@/services/staffingRequirementService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { ShiftTemplate, Site, SiteShiftRequirement } from '@/types';

function statusLabel(status: SiteShiftRequirement['status']) {
  return status === 'active' ? '啟用' : '停用';
}

export default function StaffingRequirementListScreen() {
  const router = useRouter();
  const { actor, can, currentSite } = useSession();
  const { colors, fontScale } = useTheme();
  const [siteId, setSiteId] = useState(currentSite?.id ?? '');
  const [sites, setSites] = useState<Site[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [rows, setRows] = useState<SiteShiftRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const siteList = await listSites(actor.tenantId ?? '');
    setSites(siteList);
    setTemplates(await getShiftTemplates(actor, siteId || null));
    setRows(await listStaffingRequirements(actor, siteId || null));
  }, [actor, siteId]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  return (
    <Screen>
      <ErrorBanner message={error} />
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        依案場與班別設定最低勤務人數。未設定時請假與排班不會自行推測缺員。
      </Text>
      <QinSelect
        label="案場"
        value={siteId}
        options={[{ value: '', label: '全部案場' }, ...sites.map((site) => ({ value: site.id, label: site.name }))]}
        onChange={setSiteId}
      />
      {can('staffingRequirement.manage') ? (
        <QinButton
          label="新增人力需求"
          onPress={() =>
            router.push({
              pathname: '/(main)/manage/staffing-requirements/new',
              params: { siteId },
            })
          }
        />
      ) : null}
      {rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginTop: spacing.md })}>
          尚未設定最低勤務人數
        </Text>
      ) : (
        rows.map((item) => {
          const site = sites.find((s) => s.id === item.siteId);
          const template = templates.find((t) => t.id === item.shiftTemplateId);
          const shiftName = template
            ? `${template.name}（${template.startTime}～${template.endTime}）`
            : '未指定班別';
          return (
            <ListRow
              key={item.id}
              title={`${site?.name ?? item.siteId} · ${shiftName}`}
              subtitle={`最低 ${item.requiredHeadcount} 人 · ${item.effectiveStartDate} 起${item.effectiveEndDate ? ` ～ ${item.effectiveEndDate}` : ''}`}
              meta={statusLabel(item.status)}
              onPress={() =>
                router.push({ pathname: '/(main)/manage/staffing-requirements/[id]', params: { id: item.id } })
              }
            />
          );
        })
      )}
    </Screen>
  );
}
