import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorBanner, InfoBanner } from '@/components/ui/Banners';
import { clockIn, clockOut } from '@/services/attendanceService';
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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

type ExpoCameraView = typeof import('expo-camera').CameraView;
let CameraView: ExpoCameraView | null = null;

export default function QrScanScreen() {
  const params = useLocalSearchParams<{ clock?: string; siteId?: string; scheduleId?: string }>();
  const attendanceMode = params.clock === 'in' || params.clock === 'out';
  const pendingScan = useRef(false);
  const [completed, setCompleted] = useState(false);
  const { actor } = useSession();
  const { colors, fontScale } = useTheme();
  const { isTablet, landscape } = useResponsive();
  const [permission, setPermission] = useState<CameraPermissionState>('undetermined');
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<QrScanOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    void import('expo-camera')
      .then((mod) => {
        CameraView = mod.CameraView;
        setCameraReady(true);
      })
      .catch(() => {
        CameraView = null;
        setCameraReady(false);
      });
  }, []);

  const resetScan = useCallback(() => {
    setCompleted(false);
    setError(null);
    setOutcome(null);
    setManual('');
  }, []);
  useEffect(resetScan, [resetScan, params.clock, params.siteId, params.scheduleId]);
  useFocusEffect(
    useCallback(() => {
      resetScan();
      void getCameraPermissionState().then(setPermission);
    }, [resetScan]),
  );

  const handleCode = useCallback(
    async (code: string) => {
      if (!code.trim() || pendingScan.current || completed) return;
      pendingScan.current = true;
      setBusy(true);
      setError(null);
      try {
        if (attendanceMode) {
          if (!params.siteId) throw new Error('請返回打卡頁選擇案場');
          if (params.clock === 'in') {
            await clockIn(actor, { siteId: params.siteId, scheduleId: params.scheduleId || null, siteQrCode: code });
          } else {
            await clockOut(actor, { siteId: params.siteId, siteQrCode: code });
          }
          setCompleted(true);
          return;
        }
        const result = await scanQr(actor, code);
        if (!result.debounced) {
          setOutcome(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '掃描失敗');
      } finally {
        pendingScan.current = false;
        setBusy(false);
      }
    },
    [actor, attendanceMode, completed, params.clock, params.scheduleId, params.siteId],
  );

  const cameraBlock = (
    <View style={{ flex: 1, minHeight: 240, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      {!completed && permission === 'granted' && cameraReady && CameraView ? (
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
      {completed ? <><InfoBanner message={params.clock === 'in' ? '上班打卡完成' : '下班打卡完成'} /><QinButton label="返回打卡頁" onPress={() => router.back()} /></> : null}
      <QinInput label="無法使用相機時可手動輸入 QR" value={manual} onChangeText={setManual} autoCapitalize="none" />
      <QinButton label="識別" loading={busy} onPress={() => void handleCode(manual)} />
      {outcome ? <ScanResultCard outcome={outcome} /> : null}
    </View>
  );

  return (
    <Screen scroll={!isTablet && !landscape} padded>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        {attendanceMode ? '掃描目前案場的 QR 後完成打卡；需要定位的案場仍會驗證 GPS。' : 'QR 只用來識別資產，查看資料仍須登入與權限。'}
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
  if (outcome.keyLoan) {
    const item = outcome.keyLoan;
    return (
      <QinCard style={{ marginTop: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{item.name}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.accent, marginTop: 6 })}>
          {item.kind === 'managed_key' ? '鑰匙' : '公共物品'} · {item.status}
        </Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>存放位置：{item.storageLocation ?? '—'}</Text>
        <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>
          {item.checkedOut ? '目前已借出' : '目前可借用'}
        </Text>
        {item.borrowerName ? (
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>借用人：{item.borrowerName}</Text>
        ) : null}
        {item.dueAt ? (
          <Text style={textStyle(colors, fontScale, 'sm', { marginTop: 4 })}>應還時間：{formatDateTimeZh(item.dueAt)}</Text>
        ) : null}
      </QinCard>
    );
  }
  return (
    <QinCard style={{ marginTop: spacing.md }}>
      <Text style={textStyle(colors, fontScale, 'sm')}>{outcome.message}</Text>
    </QinCard>
  );
}
