import { QR_PAYLOAD_PREFIX } from '@/constants/qr';
import { createId } from '@/utils/id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildQrPayload(opaqueId = createId()): string {
  return `${QR_PAYLOAD_PREFIX}${opaqueId}`;
}

export function isQinGuanQrPayload(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed.startsWith(QR_PAYLOAD_PREFIX) && !trimmed.toUpperCase().startsWith(QR_PAYLOAD_PREFIX)) {
    return false;
  }
  const token = trimmed.slice(QR_PAYLOAD_PREFIX.length);
  return UUID_RE.test(token);
}

export function isForeignQrPayload(code: string): boolean {
  const trimmed = code.trim();
  return trimmed.length > 0 && !isQinGuanQrPayload(trimmed);
}
