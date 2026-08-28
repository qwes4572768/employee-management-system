import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ButtonRow, QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { SITE_STATUS_LABELS } from '@/constants/app';
import { useSession } from '@/providers/SessionProvider';
import { getSiteById } from '@/repositories/siteRepository';
import { changeSiteStatus, editSite } from '@/services/siteService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import type { Site } from '@/types';
import { parseOptionalNumber } from '@/utils/validation';

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { actor, can, refresh, tenant } = useSession();
  const { colors, fontScale } = useTheme();
  const [site, setSite] = useState<Site | null>(null);
  const [form, setForm] = useState({
    siteCode: '',
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    attendanceRadius: '',
    requireGps: false,
    requireSiteQr: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id || !tenant) {
      return;
    }
    void getSiteById(id, tenant.id).then((item) => {
      setSite(item);
      if (item) {
        setForm({
          siteCode: item.siteCode,
          name: item.name,
          address: item.address ?? '',
          latitude: item.latitude != null ? String(item.latitude) : '',
          longitude: item.longitude != null ? String(item.longitude) : '',
          attendanceRadius: item.attendanceRadius != null ? String(item.attendanceRadius) : '',
          requireGps: item.requireGps,
          requireSiteQr: item.requireSiteQr,
        });
      }
    });
  }, [id, tenant]);

  if (!site) {
    return (
      <Screen>
        <Text style={textStyle(colors, fontScale, 'md')}>找不到案場</Text>
      </Screen>
    );
  }

  const reload = async () => {
    if (!id) return;
    const item = await getSiteById(id, tenant?.id);
    setSite(item);
    await refresh();
  };

  return (
    <Screen>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginBottom: spacing.md })}>
        狀態：{SITE_STATUS_LABELS[site.status]}
      </Text>
      <ErrorBanner message={error} />
      <QinInput label="案場代碼" value={form.siteCode} onChangeText={(v) => setForm({ ...form, siteCode: v })} editable={can('sites.update')} />
      <QinInput label="案場名稱" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} editable={can('sites.update')} />
      <QinInput label="地址" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} editable={can('sites.update')} />
      <QinInput label="緯度" value={form.latitude} onChangeText={(v) => setForm({ ...form, latitude: v })} keyboardType="decimal-pad" editable={can('sites.update')} />
      <QinInput label="經度" value={form.longitude} onChangeText={(v) => setForm({ ...form, longitude: v })} keyboardType="decimal-pad" editable={can('sites.update')} />
      <QinInput label="出勤半徑（公尺）" value={form.attendanceRadius} onChangeText={(v) => setForm({ ...form, attendanceRadius: v })} keyboardType="decimal-pad" editable={can('sites.update')} />
      <SwitchRow label="未來需要 GPS 打卡" value={form.requireGps} onValueChange={(v) => setForm({ ...form, requireGps: v })} />
      <SwitchRow label="未來需要案場 QR" value={form.requireSiteQr} onValueChange={(v) => setForm({ ...form, requireSiteQr: v })} />
      {can('sites.update') ? (
        <QinButton
          label="儲存修改"
          loading={loading}
          onPress={() => {
            void (async () => {
              setLoading(true);
              setError(null);
              try {
                await editSite(actor, site.id, {
                  siteCode: form.siteCode,
                  name: form.name,
                  address: form.address,
                  latitude: parseOptionalNumber(form.latitude, '緯度'),
                  longitude: parseOptionalNumber(form.longitude, '經度'),
                  attendanceRadius: parseOptionalNumber(form.attendanceRadius, '出勤半徑'),
                  requireGps: form.requireGps,
                  requireSiteQr: form.requireSiteQr,
                });
                await reload();
              } catch (err) {
                setError(err instanceof Error ? err.message : '儲存失敗');
              } finally {
                setLoading(false);
              }
            })();
          }}
        />
      ) : null}
      <ButtonRow>
        {can('sites.update') && site.status === 'active' ? (
          <QinButton
            label="停用案場"
            variant="secondary"
            onPress={() => void changeSiteStatus(actor, site.id, 'inactive').then(reload)}
          />
        ) : null}
        {can('sites.update') && site.status === 'inactive' ? (
          <QinButton
            label="重新啟用"
            variant="secondary"
            onPress={() => void changeSiteStatus(actor, site.id, 'active').then(reload)}
          />
        ) : null}
        {can('sites.update') && site.status !== 'archived' ? (
          <QinButton
            label="封存案場"
            variant="danger"
            onPress={() => void changeSiteStatus(actor, site.id, 'archived').then(() => router.back())}
          />
        ) : null}
      </ButtonRow>
    </Screen>
  );
}
