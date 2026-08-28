const PHONE_RE = /^[0-9+\-() ]{8,20}$/;
const ACCOUNT_RE = /^[A-Za-z0-9._-]{4,40}$/;
const TAX_ID_RE = /^[0-9]{8}$/;

export function required(value: string | null | undefined, label: string): string | null {
  if (!value || !value.trim()) {
    return `請輸入${label}`;
  }
  return null;
}

export function validatePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) {
    return '請輸入手機號碼';
  }
  if (!PHONE_RE.test(trimmed)) {
    return '手機號碼格式不正確';
  }
  return null;
}

export function validateAccount(account: string): string | null {
  const trimmed = account.trim();
  if (!trimmed) {
    return '請輸入登入帳號';
  }
  if (!ACCOUNT_RE.test(trimmed)) {
    return '帳號需為 4–40 字元，僅能使用英數、點、底線或連字號';
  }
  const reserved = ['admin', 'root', 'test', 'administrator'];
  if (reserved.includes(trimmed.toLowerCase())) {
    return '請使用個人帳號，不可使用系統預設帳號名稱';
  }
  return null;
}

export function validateTaxId(taxId: string): string | null {
  if (!taxId.trim()) {
    return null;
  }
  if (!TAX_ID_RE.test(taxId.trim())) {
    return '統一編號需為 8 位數字';
  }
  return null;
}

export function validateEmployeeNo(value: string): string | null {
  if (!value.trim()) {
    return '請輸入員工編號';
  }
  if (value.trim().length > 32) {
    return '員工編號過長';
  }
  return null;
}

export function firstError(errors: Array<string | null | undefined>): string | null {
  return errors.find((item): item is string => Boolean(item)) ?? null;
}
