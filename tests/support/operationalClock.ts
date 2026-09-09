import { clockIn as realClockIn, clockOut as realClockOut } from '@/services/attendanceService';
import { startWorkSession as realStart, endWorkSession as realEnd } from '@/services/workSessionService';
import { withOperationalClockForTest } from '@/services/clockProvider';

// This module is imported only by Node tests, never by app screens/services.
if (process.release?.name !== 'node') throw new Error('Node test helper only');
process.env.NODE_ENV = 'test';

export function clockIn(actor: Parameters<typeof realClockIn>[0], input: Parameters<typeof realClockIn>[1] & { at?: string }) {
  const { at, ...data } = input;
  return at ? withOperationalClockForTest(at, () => realClockIn(actor, data)) : realClockIn(actor, data);
}
export function clockOut(actor: Parameters<typeof realClockOut>[0], input: Parameters<typeof realClockOut>[1] & { at?: string }) {
  const { at, ...data } = input;
  return at ? withOperationalClockForTest(at, () => realClockOut(actor, data)) : realClockOut(actor, data);
}
export function startWorkSession(actor: Parameters<typeof realStart>[0], input: Parameters<typeof realStart>[1] & { at?: string }) {
  const { at, ...data } = input;
  return at ? withOperationalClockForTest(at, () => realStart(actor, data)) : realStart(actor, data);
}
export function endWorkSession(actor: Parameters<typeof realEnd>[0], input?: NonNullable<Parameters<typeof realEnd>[1]> & { at?: string }) {
  const { at, ...data } = input ?? {};
  return at ? withOperationalClockForTest(at, () => realEnd(actor, data)) : realEnd(actor, data);
}
