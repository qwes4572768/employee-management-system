import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { ErrorBanner } from '@/components/ui/Banners';
import { ListRow } from '@/components/ui/ListRow';
import { QinButton } from '@/components/ui/QinButton';
import { QinInput } from '@/components/ui/QinInput';
import { Segmented } from '@/components/ui/Segmented';
import { QR_ASSET_TYPE_LABELS, QR_ASSET_TYPES, QR_PHASE_COMPLETE_TYPES, type QrAssetType } from '@/constants/qr';
import { useSession } from '@/providers/SessionProvider';
import { listQrAssetsForActor, type QrAssetListItem } from '@/services/qrAssetService';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { textStyle } from '@/theme/typography';
import { formatDateZh } from '@/utils/datetime';

type FilterKey = 'all' | QrAssetType;

export default function QrAssetCenterScreen() {
  const router = useRouter();
  const { actor, can } = useSession();
  const { colors, fontScale } = useTheme();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<QrAssetListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await listQrAssetsForActor(actor, { assetType: filter, query }));
  }, [actor, filter, query]);

  useFocusEffect(
    useCallback(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : '讀取失敗'));
    }, [load]),
  );

  const unimplemented = filter !== 'all' && !QR_PHASE_COMPLETE_TYPES.includes(filter);

  return (
    <Screen>
      <ErrorBanner message={error} />
      <Segmented
        value={filter}
        options={[
          { value: 'all', label: '全部' },
          { value: QR_ASSET_TYPES.EMPLOYEE, label: '人員' },
          { value: QR_ASSET_TYPES.SITE, label: '案場' },
          { value: QR_ASSET_TYPES.PATROL_POINT, label: '巡邏點' },
          { value: QR_ASSET_TYPES.EQUIPMENT, label: '設備' },
          { value: QR_ASSET_TYPES.KEY_ITEM, label: '鑰匙 / 物品' },
        ]}
        onChange={setFilter}
      />
      <QinInput label="搜尋姓名、員工編號、案場名稱或 QR ID" value={query} onChangeText={setQuery} />
      {can('qrAsset.create') ? (
        <>
          <QinButton label="建立人員 QR" onPress={() => router.push('/(main)/manage/qr-assets/new-employee')} />
          <QinButton label="建立案場 QR" variant="secondary" onPress={() => router.push('/(main)/manage/qr-assets/new-site')} />
          <QinButton label="建立巡邏點 QR" variant="secondary" onPress={() => router.push('/(main)/manage/qr-assets/new-patrol-point')} />
        </>
      ) : null}
      {can('qrScan.viewHistory') ? (
        <QinButton label="掃描紀錄" variant="ghost" onPress={() => router.push('/(main)/manage/qr-assets/scans')} />
      ) : null}
      {unimplemented ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.warning, marginTop: spacing.md })}>
          尚未建立資料
        </Text>
      ) : rows.length === 0 ? (
        <Text style={textStyle(colors, fontScale, 'sm', { color: colors.textMuted, marginTop: spacing.md })}>
          尚未建立資料
        </Text>
      ) : (
        rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.displayName}
            subtitle={`${QR_ASSET_TYPE_LABELS[item.assetType]} · ${item.status === 'active' ? '有效' : '停用'} · ${item.createdByName ?? '—'} · ${formatDateZh(item.createdAt)}`}
            meta={item.lastScanAt ? `最後掃描 ${formatDateZh(item.lastScanAt)}` : '尚未掃描'}
            onPress={() => router.push({ pathname: '/(main)/manage/qr-assets/[id]', params: { id: item.id } })}
          />
        ))
      )}
    </Screen>
  );
}
