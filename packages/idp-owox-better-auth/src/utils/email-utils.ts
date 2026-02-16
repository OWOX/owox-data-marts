const EMAIL_MAX_LENGTH = 254;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  if (!value || value.length > EMAIL_MAX_LENGTH) {
    return false;
  }
  return SIMPLE_EMAIL_REGEX.test(value);
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = normalizeEmail(value);
  if (!isValidEmail(normalized)) {
    return null;
  }
  return normalized;
}
