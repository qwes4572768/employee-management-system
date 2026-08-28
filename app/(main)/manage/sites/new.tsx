import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useSession } from '@/providers/SessionProvider';
import { createSite } from '@/services/siteService';

export default function NewSiteScreen() {
  const router = useRouter();
  const { tenant, actor } = useSession();
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

  return (
    <Screen>
      <ErrorBanner message={error} />
      <QinInput label="案場代碼" value={form.siteCode} onChangeText={(v) => setForm({ ...form, siteCode: v })} />
      <QinInput label="案場名稱" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
      <QinInput label="地址" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} />
      <QinInput label="緯度（選填）" value={form.latitude} onChangeText={(v) => setForm({ ...form, latitude: v })} keyboardType="decimal-pad" />
      <QinInput label="經度（選填）" value={form.longitude} onChangeText={(v) => setForm({ ...form, longitude: v })} keyboardType="decimal-pad" />
      <QinInput label="出勤半徑公尺（選填）" value={form.attendanceRadius} onChangeText={(v) => setForm({ ...form, attendanceRadius: v })} keyboardType="decimal-pad" />
      <SwitchRow label="未來需要 GPS 打卡" value={form.requireGps} onValueChange={(v) => setForm({ ...form, requireGps: v })} />
      <SwitchRow label="未來需要案場 QR" value={form.requireSiteQr} onValueChange={(v) => setForm({ ...form, requireSiteQr: v })} />
      <QinButton
        label="建立案場"
        loading={loading}
        onPress={() => {
          void (async () => {
            if (!tenant) {
              return;
            }
            setLoading(true);
            setError(null);
            try {
              await createSite(actor, {
                tenantId: tenant.id,
                siteCode: form.siteCode,
                name: form.name,
                address: form.address,
                latitude: form.latitude ? Number(form.latitude) : null,
                longitude: form.longitude ? Number(form.longitude) : null,
                attendanceRadius: form.attendanceRadius ? Number(form.attendanceRadius) : null,
                requireGps: form.requireGps,
                requireSiteQr: form.requireSiteQr,
              });
              router.back();
            } catch (err) {
              setError(err instanceof Error ? err.message : '建立失敗');
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
    </Screen>
  );
}
