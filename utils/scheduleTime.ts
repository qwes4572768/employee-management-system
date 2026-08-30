import { parseDateOnly, toDateOnly } from './datetime';

export function parseHm(value: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error('時間格式需為 HH:mm');
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('時間格式需為 HH:mm');
  }
  return { hours, minutes };
}

export function combineDateAndTime(workDate: string, hm: string): Date {
  const date = parseDateOnly(workDate);
  if (!date) {
    throw new Error('日期格式不正確');
  }
  const { hours, minutes } = parseHm(hm);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

export function buildShiftRange(input: {
  workDate: string;
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean;
}): { start: Date; end: Date; plannedMinutes: number; crossesMidnight: boolean } {
  const start = combineDateAndTime(input.workDate, input.startTime);
  let end = combineDateAndTime(input.workDate, input.endTime);
  const crosses =
    input.crossesMidnight ??
    (end.getTime() <= start.getTime() || input.startTime === input.endTime ? input.startTime !== input.endTime : false);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  const plannedMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (plannedMinutes <= 0) {
    throw new Error('班別工時不可為負或零');
  }
  return { start, end, plannedMinutes, crossesMidnight: crosses || end.getDate() !== start.getDate() };
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

export function overlapRange(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): { start: Date; end: Date; minutes: number } | null {
  if (!intervalsOverlap(aStart, aEnd, bStart, bEnd)) {
    return null;
  }
  const start = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const end = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  return { start, end, minutes: Math.round((end.getTime() - start.getTime()) / 60000) };
}

export function minutesBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 60000);
}

export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  if (!date) {
    throw new Error('日期格式不正確');
  }
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function yearMonthOf(dateOnly: string): string {
  return dateOnly.slice(0, 7);
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) {
    throw new Error('日期格式不正確');
  }
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function formatHmFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDurationZh(totalMinutes: number): string {
  const abs = Math.abs(totalMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours === 0) {
    return `${minutes} 分鐘`;
  }
  if (minutes === 0) {
    return `${hours} 小時`;
  }
  return `${hours} 小時 ${minutes} 分`;
}

export function shiftIsoByDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function eachDateInclusive(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
