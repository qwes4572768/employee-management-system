import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { QinButton } from '@/components/ui/QinButton';
import { QinCard } from '@/components/ui/QinCard';
import { QinInput } from '@/components/ui/QinInput';
import { QinSelect } from '@/components/ui/QinSelect';
import { QrCodeView } from '@/components/qr/QrCodeView';
import { QR_ASSET_TYPE_LABELS, QR_DEACTIVATE_REASONS } from '@/constants/qr';
import { useSession } from '@/providers/SessionProvider';
import { getUserById } from '@/repositories/userRepository';
import { deactivateQrAssetByActor, getQrAssetForViewer, issueEmployeeQr, issueSiteQr, reactivateQrAssetByActor } from '@/services/qrAssetService';
import { exportQrPng } from '@/services/qrRenderService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateTimeZh } from '@/utils/datetime';
import type { QrAsset } from '@/types';

export default function QrAssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [asset, setAsset] = useState<QrAsset | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [reasonKey, setReasonKey] = useState('qr_leaked');
  const [reasonNote, setReasonNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const item = await getQrAssetForViewer(actor, id);
    setAsset(item);
    if (item.createdBy) {
      const user = await getUserById(item.createdBy, actor.tenantId ?? undefined);
      setCreator(user?.fullName ?? null);
    }
  }, [actor, id]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  if (!asset) {
    return (
      <Screen>
        <ErrorBanner message={error} />
      </Screen>
    );
  }

  const reasonLabel = QR_DEACTIVATE_REASONS.find((item) => item.value === reasonKey)?.label ?? '其他';
  const reason = reasonKey === 'other' ? reasonNote : reasonNote.trim() ? `${reasonLabel}：${reasonNote.trim()}` : reasonLabel;

  return (
    <Screen>
      <ErrorBanner message={error} />
      {message ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.success, marginBottom: spacing.sm })}>{message}</Text>
      ) : null}
      <Text style={textStyle(colors, fontScale, 'xl', { fontWeight: '800' })}>{asset.displayName}</Text>
      <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginBottom: spacing.md })}>
        {QR_ASSET_TYPE_LABELS[asset.assetType]} · {asset.status === 'active' ? '永久有效' : '已停用'}
      </Text>
      <QinCard>
        <QrCodeView value={asset.qrCode} />
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, textAlign: 'center' })}>
          建立人 {creator ?? '—'} · {formatDateTimeZh(asset.createdAt)}
        </Text>
        <Text style={textStyle(colors, fontScale, 'xs', { color: colors.textMuted, textAlign: 'center', marginTop: 4 })}>
          最後掃描 {asset.lastScanAt ? formatDateTimeZh(asset.lastScanAt) : '尚未掃描'} · 掃描 {asset.scanCount} 次
        </Text>
        {asset.status === 'inactive' ? (
          <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, textAlign: 'center', marginTop: spacing.sm })}>
            停用時間 {asset.deactivatedAt ? formatDateTimeZh(asset.deactivatedAt) : '—'}
          </Text>
        ) : null}
      </QinCard>
      {can('qrAsset.export') ? (
        <QinButton
          label="匯出 PNG"
          variant="secondary"
          onPress={() => {
            void exportQrPng(actor, asset.id)
              .then(async (file) => {
                if (Platform.OS === 'web' && typeof document !== 'undefined') {
                  const link = document.createElement('a');
                  link.href = file.dataUrl;
                  link.download = file.fileName;
                  link.click();
                } else {
                  const FileSystem = await import('expo-file-system/legacy');
                  const Sharing = await import('expo-sharing');
                  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
                  if (!base) throw new Error('無法寫入檔案');
                  const path = `${base}${file.fileName}`;
                  const raw = file.dataUrl.replace(/^data:image\/png;base64,/, '');
                  await FileSystem.writeAsStringAsync(path, raw, { encoding: FileSystem.EncodingType.Base64 });
                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(path, { mimeType: 'image/png', UTI: 'public.png' });
                  }
                }
                setMessage('已匯出 PNG');
              })
              .catch((err) => setError(err instanceof Error ? err.message : '匯出失敗'));
          }}
        />
      ) : null}
      {asset.status === 'active' && can('qrAsset.deactivate') ? (
        <>
          <QinSelect
            label="停用原因"
            value={reasonKey}
            options={QR_DEACTIVATE_REASONS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={setReasonKey}
          />
          <QinInput label="補充說明（選填，選其他時必填）" value={reasonNote} onChangeText={setReasonNote} multiline />
          <QinButton
            label="停用此 QR"
            variant="danger"
            onPress={() => {
              const finalReason = reasonKey === 'other' ? reasonNote.trim() : reason;
              void deactivateQrAssetByActor(actor, asset.id, finalReason)
                .then(load)
                .catch((err) => setError(err instanceof Error ? err.message : '停用失敗'));
            }}
          />
          {can('qrAsset.create') ? (
            <QinButton
              label="重新產生"
              variant="secondary"
              onPress={() => {
                const run =
                  asset.assetType === 'employee'
                    ? issueEmployeeQr(actor, asset.targetId, true)
                    : issueSiteQr(actor, asset.targetId, true);
            void run.then((created) => {
              setAsset(created);
              setMessage('已重新產生新的永久 QR，舊 QR 已停用');
            }).catch((err) => setError(err instanceof Error ? err.message : '重新產生失敗'));
              }}
            />
          ) : null}
        </>
      ) : null}
      {asset.status === 'inactive' && can('qrAsset.reactivate') ? (
        <QinButton
          label="重新啟用"
          onPress={() => {
            void reactivateQrAssetByActor(actor, asset.id)
              .then(load)
              .catch((err) => setError(err instanceof Error ? err.message : '重新啟用失敗'));
          }}
        />
      ) : null}
    </Screen>
  );
}
