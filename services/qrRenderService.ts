import QRCode from 'qrcode';

import { getQrAssetForViewer } from './qrAssetService';
import type { ActorContext } from './actor';
import { requireActorPermission } from './access';
import { writeAudit } from './auditService';
import { formatDateTimeZh, nowIso } from '@/utils/datetime';
import { QR_ASSET_TYPE_LABELS } from '@/constants/qr';

export async function buildQrPngDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 512,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

export async function exportQrPng(actor: ActorContext, assetId: string): Promise<{ dataUrl: string; fileName: string }> {
  await requireActorPermission(actor, 'qrAsset.export');
  const asset = await getQrAssetForViewer(actor, assetId);
  const dataUrl = await buildQrPngDataUrl(asset.qrCode);
  const fileName = `qinguan-qr-${asset.assetType}-${asset.id.slice(0, 8)}.png`;
  await writeAudit({
    actor,
    action: 'export',
    module: 'qrAsset',
    description: `${actor.fullName} 於 ${formatDateTimeZh(nowIso())} 匯出「${asset.displayName}」的${QR_ASSET_TYPE_LABELS[asset.assetType]} PNG。`,
    targetType: 'qr_asset',
    targetId: asset.id,
    targetDisplayName: asset.displayName,
    siteId: asset.siteId,
  });
  return { dataUrl, fileName };
}

export async function exportQrPdfBatch(_actor: ActorContext, _assetIds: string[]): Promise<never> {
  throw new Error('PDF 批次列印尚未開放，以免影響本階段穩定性');
}
