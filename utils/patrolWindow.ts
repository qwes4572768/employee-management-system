import { combineDateAndTime, formatHmFromIso, minutesBetween } from '@/utils/scheduleTime';
import { toDateOnly } from '@/utils/datetime';

export function resolvePatrolWindow(input: {
  shiftStart: Date;
  shiftEnd: Date;
  windowStartTime: string;
  windowEndTime: string;
}): { start: Date; end: Date } {
  const dateOnly = toDateOnly(input.shiftStart);
  let start = combineDateAndTime(dateOnly, input.windowStartTime);
  let end = combineDateAndTime(dateOnly, input.windowEndTime);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  if (end.getTime() <= input.shiftStart.getTime()) {
    start = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  if (end.getTime() <= start.getTime()) {
    throw new Error('巡邏時間窗不正確');
  }
  return { start, end };
}

export function graceDeadline(windowEndAt: Date, graceMinutes: number): Date {
  return new Date(windowEndAt.getTime() + Math.max(0, graceMinutes) * 60 * 1000);
}

export function formatWindowLabel(startIso: string, endIso: string): string {
  return `${formatHmFromIso(startIso)}～${formatHmFromIso(endIso)}`;
}

export function minutesUntil(at: Date, targetIso: string): number {
  return minutesBetween(at, new Date(targetIso));
}
