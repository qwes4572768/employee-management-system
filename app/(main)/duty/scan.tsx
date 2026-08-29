import { useCallback, useState, type ComponentType } from 'react';
import { Platform, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { GENDER_LABELS } from '@/constants/app';
import { useResponsive } from '@/hooks/useResponsive';
import { useSession } from '@/providers/SessionProvider';
import {
  getCameraPermissionState,
  requestCameraPermission,
  scanQr,
  type CameraPermissionState,
} from '@/services/qrScannerService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh, formatDateZh } from '@/utils/datetime';
import type { QrScanOutcome } from '@/types';
import { useFocusEffect } from 'expo-router';

let CameraView: ComponentType<{
  style?: object;
  facing?: 'back' | 'front';
  barcodeScannerSettings?: { barcodeTypes: string[] };
  onBarcodeScanned?: (event: { data: string }) => void;
}> | null = null;

try {
  // Native / web camera is optional; tests and desktop web still work via manual input.
  CameraView = require('expo-camera').CameraView;
} catch {
  CameraView = null;
}

export default function QrScanScreen() {
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const { isTablet, landscape } = useResponsive();
  const [permission, setPermission] = useState<CameraPermissionState>('undetermined');
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<QrScanOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getCameraPermissionState().then(setPermission);
    }, []),
  );

  const handleCode = useCallback(
    async (code: string) => {
      if (!code.trim() || busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await scanQr(actor, code);
        if (!result.debounced) {
          setOutcome(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '掃描失敗');
      } finally {
        setBusy(false);
      }
    },
    [actor, busy],
  );

  const cameraBlock = (
    <View style={{ flex: 1, minHeight: 240, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      {permission === 'granted' && CameraView ? (
        <CameraView
          style={{ flex: 1, minHeight: 240 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(event: { data: string }) => {
            void handleCode(event.data);
          }}
        />
      ) : (
        <View style={{ flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', padding: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'sm', { color: '#fff', textAlign: 'center' })}>
            {permissionLabel(permission)}
          </Text>
          {permission === 'undetermined' || permission === 'denied' ? (
            <QinButton
              label="允許相機權限"
              onPress={() => {
                void requestCameraPermission().then(setPermission);
              }}
            />
          ) : null}
        </View>
      )}
    </View>
  );

  const resultBlock = (
    <View style={{ flex: isTablet || landscape ? 1 : undefined }}>
      <ErrorBanner message={error} />
      <QinInput label="無法使用相機時可手動輸入 QR" value={manual} onChangeText={setManual} autoCapitalize="none" />
      <QinButton label="識別" loading={busy} onPress={() => void handleCode(manual)} />
      {outcome ? <ScanResultCard outcome={outcome} /> : null}
    </View>
  );

  return (
    <Screen scroll={!isTablet && !landscape} padded>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        QR 只用來識別資產，查看資料仍須登入與權限。
      </Text>
      <View style={{ flexDirection: isTablet || landscape ? 'row' : 'column', gap: spacing.md, flex: 1 }}>
        <View style={{ flex: isTablet || landscape ? 1 : undefined, minHeight: Platform.OS === 'web' ? 280 : 240 }}>
          {cameraBlock}
        </View>
        {resultBlock}
      </View>
    </Screen>
  );
}

function permissionLabel(state: CameraPermissionState): string {
  if (state === 'undetermined') return '尚未詢問相機權限';
  if (state === 'denied') return '尚未允許相機權限';
  if (state === 'blocked') return '相機權限已被永久拒絕，請至系統設定開啟';
  if (state === 'unavailable') return '此裝置無法使用相機，請改用手動輸入';
  return '相機已就緒';
}

function ScanResultCard({ outcome }: { outcome: QrScanOutcome }) {
  const { colors, fontScale } = useTheme();
  if (outcome.scanResult === 'cross_tenant') {
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'md', { color: colors.danger, fontWeight: '800' })}>
          此 QR 不屬於目前公司
        </Text>
      </QinCard>
    );
  }
  if (outcome.scanResult === 'unauthorized') {
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'md', { color: colors.danger, fontWeight: '800' })}>
          {outcome.message}
        </Text>
      </QinCard>
    );
  }
  if (outcome.scanResult === 'inactive') {
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'md', { color: colors.warning, fontWeight: '800' })}>此 QR 已停用</Text>
        {outcome.deactivatedAt ? (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 6 })}>
            停用時間 {formatDateTimeZh(outcome.deactivatedAt)}
          </Text>
        ) : null}
      </QinCard>
    );
  }
  if (outcome.scanResult !== 'valid') {
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'md', { color: colors.warning, fontWeight: '800' })}>
          {outcome.message}
        </Text>
      </QinCard>
    );
  }
  if (outcome.employee) {
    const person = outcome.employee;
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Avatar uri={person.photoUri} name={person.fullName} size={64} />
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800', marginTop: spacing.sm })}>
          {person.fullName}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
          {person.employeeNo ?? '—'} · {GENDER_LABELS[person.gender]} · 到職 {formatDateZh(person.hireDate)}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
          {person.jobTitle ?? '—'}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: spacing.sm })}>
          目前勤務狀態：{person.dutyStatusLabel ?? '—'}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>今天排班：{person.todayShiftName ?? '無'}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>目前案場：{person.currentSiteName ?? '—'}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
          {person.clockedIn ? '已打卡' : '尚未打卡'} · {person.onDuty ? '勤務中' : '未在勤務階段'}
        </Text>
      </QinCard>
    );
  }
  if (outcome.site) {
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{outcome.site.name}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: 4 })}>
          案場代碼 {outcome.site.siteCode}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>狀態：{outcome.site.status}</Text>
      </QinCard>
    );
  }
  return (
    <QinCard style={{ marginTop: spacing.md }}>
      <Text style={textStyle(colors, fontScale, 'sm')}>{outcome.message}</Text>
    </QinCard>
  );
}
