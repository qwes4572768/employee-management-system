export function normalizePlateNumber(raw: string): string {
  const halfWidth = raw.replace(/[\uFF01-\uFF5E]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );
  return halfWidth
    .replace(/[\s\u3000\u00A0\-－—–_]/g, '')
    .trim()
    .toUpperCase();
}
