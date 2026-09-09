import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { useResponsive } from '@/hooks/useResponsive';
import { useSession } from '@/providers/SessionProvider';
import {
  getCameraPermissionState,
  requestCameraPermission,
  type CameraPermissionState,
} from '@/services/qrScannerService';
import { InspectionUnauthorizedError, startInspectionFromQr } from '@/services/inspectionService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';

type ExpoCameraView = typeof import('expo-camera').CameraView;
let CameraView: ExpoCameraView | null = null;

export default function InspectScanScreen() {
  const router = useRouter();
  const { actor, currentSite, can } = useSession();
  const { colors, fontScale } = useTheme();
  const { isTablet, landscape } = useResponsive();
  const [permission, setPermission] = useState<CameraPermissionState>('undetermined');
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
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
        const result = await startInspectionFromQr(actor, code, { siteId: currentSite?.id ?? null });
        router.push({ pathname: '/(main)/inspect/[sessionId]', params: { sessionId: result.session.id } });
      } catch (err) {
        if (err instanceof InspectionUnauthorizedError) {
          setError('unauthorized：您沒有權限督勤此案場人員');
        } else {
          setError(err instanceof Error ? err.message : '掃描失敗');
        }
      } finally {
        setBusy(false);
      }
    },
    [actor, busy, currentSite, router],
  );

  if (!can('inspection.scan')) {
    return (
      <Screen>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.danger })}>沒有掃碼督勤權限</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={!isTablet && !landscape} padded>
      <QinCard style={{ marginBottom: spacing.md }}>
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted })}>
          掃描員工永久 QR。QR 只負責識別，現場仍須比對照片、班表與勤務狀態。
        </Text>
      </QinCard>
      <ErrorBanner message={error} />
      <View style={{ flexDirection: isTablet || landscape ? 'row' : 'column', gap: spacing.md, flex: 1 }}>
        <View style={{ flex: 1, minHeight: 240, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
          {permission === 'granted' && cameraReady && CameraView ? (
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
                {permission === 'unavailable' ? '此裝置無法使用相機，請改用手動輸入' : '需要相機權限才能掃碼'}
              </Text>
              {permission === 'undetermined' || permission === 'denied' ? (
                <QinButton label="允許相機權限" onPress={() => void requestCameraPermission().then(setPermission)} />
              ) : null}
            </View>
          )}
        </View>
        <View style={{ flex: isTablet || landscape ? 1 : undefined }}>
          <QinInput label="無法使用相機時可手動輸入 QR" value={manual} onChangeText={setManual} autoCapitalize="none" />
          <QinButton label="開始督勤" loading={busy} onPress={() => void handleCode(manual)} />
          {Platform.OS === 'web' ? (
            <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textSubtle, marginTop: spacing.sm })}>
              雲端／模擬器可用手動輸入員工永久 QR。
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
