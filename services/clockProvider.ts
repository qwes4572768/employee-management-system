/** Operational timestamps come from the running device, never request fields. */
let testNow: string | null = null;

export function operationalNowIso(): string {
  return testNow ?? new Date().toISOString();
}

/** Only the Node test harness may substitute time; not a UI or request option. */
export async function withOperationalClockForTest<T>(at: string, action: () => Promise<T>): Promise<T> {
  if (typeof process === 'undefined' || process.release?.name !== 'node' || process.env.NODE_ENV !== 'test' || typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    throw new Error('測試時鐘只能在 Node 測試環境使用');
  }
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid fixture clock');
  const previous = testNow;
  testNow = date.toISOString();
  try { return await action(); }
  finally { testNow = previous; }
}
