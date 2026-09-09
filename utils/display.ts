import { GENDER_LABELS } from '@/constants/app';
import { formatDateTimeZh, formatDateZh } from '@/utils/datetime';
import type { AuditLog } from '@/types';

export function formatAuditLine(log: AuditLog): { title: string; time: string; actor: string } {
  return {
    actor: log.actorNameSnapshot,
    time: formatDateTimeZh(log.createdAt),
    title: log.description,
  };
}

export function genderLabel(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return GENDER_LABELS[value] ?? value;
}

export { formatDateTimeZh, formatDateZh };
