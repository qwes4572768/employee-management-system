import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { PATROL_OVERRIDE_REASONS, PATROL_POINT_LIVE_LABELS } from '@/constants/patrol';
import { useResponsive } from '@/hooks/useResponsive';
import { useSession } from '@/providers/SessionProvider';
import { completePatrolPoint } from '@/services/patrolCheckService';
import { getCameraPermissionState, requestCameraPermission, type CameraPermissionState } from '@/services/qrScannerService';
import { getPatrolTaskDetail, requirePatrolTaskPoint } from '@/services/patrolTaskService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { capturePatrolPhoto } from '@/utils/patrolPhoto';
import type { PatrolPointView } from '@/types';

type ExpoCameraView = typeof import('expo-camera').CameraView;
let CameraView: ExpoCameraView | null = null;

export default function PatrolCheckScreen() {
  const router = useRouter();
  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const { isTablet, landscape } = useResponsive();
  const [point, setPoint] = useState<PatrolPointView | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>('undetermined');
  const [cameraReady, setCameraReady] = useState(false);
  const [manual, setManual] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideDesc, setOverrideDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void import('expo-camera')
      .then((mod) => {
        CameraView = mod.CameraView;
        setCameraReady(true);
      })
      .catch(() => setCameraReady(false));
    void getCameraPermissionState().then(setPermission);
  }, []);

  useEffect(() => {
    if (!pointId || !actor.tenantId) return;
    void (async () => {
      const raw = await requirePatrolTaskPoint(pointId, actor.tenantId!);
      const detail = await getPatrolTaskDetail(actor, raw.patrolTaskId);
      setPoint(detail.points.find((item) => item.id === pointId) ?? null);
    })().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
  }, [actor, pointId]);

  const submit = useCallback(
    async (qrCode?: string) => {
      if (!pointId || busy) return;
      setBusy(true);
      setError(null);
      try {
        await completePatrolPoint(actor, pointId, {
          qrCode: qrCode || manual || null,
          photoLocalUri: photoUri,
          note,
          manualOverride: can('patrol.manualOverride') && overrideReason
            ? { reason: overrideReason, description: overrideDesc }
            : null,
        });
        router.back();
      } catch (err) {
        setError(err instanceof Error ? err.message : '完成失敗');
      } finally {
        setBusy(false);
      }
    },
    [actor, busy, can, manual, note, overrideDesc, overrideReason, photoUri, pointId, router],
  );

  const camera = (
    <View style={{ flex: 1, minHeight: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
      {permission === 'granted' && cameraReady && CameraView ? (
        <CameraView
          style={{ flex: 1, minHeight: 220 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(event: { data: string }) => {
            void submit(event.data);
          }}
        />
      ) : (
        <View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'sm', { color: '#fff', textAlign: 'center' })}>
            {permission === 'blocked'
              ? '相機權限已被永久拒絕'
              : permission === 'unavailable'
                ? '此裝置無法使用相機'
                : '尚未允許相機權限'}
          </Text>
          {permission === 'undetermined' || permission === 'denied' ? (
            <QinButton label="允許相機" onPress={() => void requestCameraPermission().then(setPermission)} />
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <Screen scroll={!isTablet && !landscape}>
      <ErrorBanner message={error} />
      {point ? (
        <QinCard style={{ marginBottom: spacing.md }}>
          <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{point.pointNameSnapshot}</Text>
          <Text style={textStyle(colors, fontScale, 'lg', { color: colors.warning, marginTop: 6 })}>
            {point.windowLabel} · {PATROL_POINT_LIVE_LABELS[point.liveStatus]}
          </Text>
        </QinCard>
      ) : null}
      <View style={{ flexDirection: isTablet || landscape ? 'row' : 'column', gap: spacing.md }}>
        <View style={{ flex: 1, minHeight: Platform.OS === 'web' ? 260 : 220 }}>{camera}</View>
        <View style={{ flex: 1 }}>
          <QinInput label="無法掃描時可手動輸入 QR" value={manual} onChangeText={setManual} autoCapitalize="none" />
          <QinButton
            label={photoUri ? '已拍攝現場照片' : '拍攝現場照片'}
            variant="secondary"
            onPress={() => {
              void capturePatrolPhoto()
                .then((uri) => setPhotoUri(uri))
                .catch((err) => setError(err instanceof Error ? err.message : '拍照失敗'));
            }}
          />
          <QinInput label="備註（選填）" value={note} onChangeText={setNote} />
          {can('patrol.manualOverride') ? (
            <>
              <QinSelect
                label="主管補登原因"
                value={overrideReason}
                options={[{ value: '', label: '不使用補登' }, ...PATROL_OVERRIDE_REASONS.map((item) => ({ value: item.value, label: item.label }))]}
                onChange={setOverrideReason}
              />
              {overrideReason ? <QinInput label="補登說明" value={overrideDesc} onChangeText={setOverrideDesc} /> : null}
            </>
          ) : null}
          <QinButton label="完成巡邏點" loading={busy} onPress={() => void submit()} />
          <QinButton
            label="發現異常"
            variant="ghost"
            onPress={() => router.push({ pathname: '/(main)/duty/patrol/exception', params: { pointId: pointId ?? '' } })}
          />
        </View>
      </View>
    </Screen>
  );
}
