import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

export const PASSWORD_ALGO = 'pbkdf2-sha256';
export const PASSWORD_ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface PasswordRecord {
  algo: string;
  iterations: number;
  salt: string;
  hash: string;
}

export interface PasswordValidation {
  ok: boolean;
  messages: string[];
}

export function validatePasswordStrength(password: string, account?: string): PasswordValidation {
  const messages: string[] = [];
  if (password.length < 8) {
    messages.push('密碼至少需要 8 個字元');
  }
  if (password.length > 72) {
    messages.push('密碼不可超過 72 個字元');
  }
  if (!/[A-Za-z]/.test(password)) {
    messages.push('密碼需包含至少一個英文字母');
  }
  if (!/\d/.test(password)) {
    messages.push('密碼需包含至少一個數字');
  }
  if (/\s/.test(password)) {
    messages.push('密碼不可包含空白');
  }
  const weak = ['123456', 'password', 'admin', '000000', 'qwerty', '111111'];
  if (weak.includes(password.toLowerCase())) {
    messages.push('請勿使用常見弱密碼');
  }
  if (account && password.toLowerCase() === account.toLowerCase()) {
    messages.push('密碼不可與帳號相同');
  }
  return { ok: messages.length === 0, messages };
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await pbkdf2Async(sha256, password, salt, {
    c: PASSWORD_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
  return {
    algo: PASSWORD_ALGO,
    iterations: PASSWORD_ITERATIONS,
    salt: bytesToHex(salt),
    hash: bytesToHex(hash),
  };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (!record.salt || !record.hash) {
    return false;
  }
  const iterations = record.iterations > 0 ? record.iterations : PASSWORD_ITERATIONS;
  const derived = await pbkdf2Async(sha256, password, hexToBytes(record.salt), {
    c: iterations,
    dkLen: KEY_LENGTH,
  });
  return timingSafeEqual(bytesToHex(derived), record.hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
