export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateTimeZh(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

export function formatDateZh(value: string | Date | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = typeof value === 'string' ? parseDateOnly(value) : value;
  if (!date || Number.isNaN(date.getTime())) {
    return '—';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function isWithinRange(
  at: Date,
  startsAt: string | null,
  expiresAt: string | null,
  isPermanent: boolean,
): boolean {
  if (isPermanent) {
    if (startsAt) {
      const start = new Date(startsAt);
      if (!Number.isNaN(start.getTime()) && at < start) {
        return false;
      }
    }
    return true;
  }
  if (startsAt) {
    const start = new Date(startsAt);
    if (!Number.isNaN(start.getTime()) && at < start) {
      return false;
    }
  }
  if (expiresAt) {
    const end = new Date(expiresAt);
    if (!Number.isNaN(end.getTime()) && at > end) {
      return false;
    }
  }
  return true;
}
