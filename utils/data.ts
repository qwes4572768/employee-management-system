export function jsonText(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function maskAccount(account: string): string {
  if (account.length <= 2) {
    return account;
  }
  return `${account.slice(0, 1)}***${account.slice(-1)}`;
}

export function boolFromSql(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export function sqlBool(value: boolean): number {
  return value ? 1 : 0;
}

export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  const next: Partial<T> = {};
  (Object.keys(value) as Array<keyof T>).forEach((key) => {
    if (value[key] !== undefined) {
      next[key] = value[key];
    }
  });
  return next;
}
