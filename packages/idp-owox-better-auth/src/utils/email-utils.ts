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

/**
 * Splits a full name into first/last parts.
 */
export function splitName(name?: string): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  const cleaned = (name || '').trim();
  if (!cleaned) {
    return { firstName: '', lastName: '', fullName: '' };
  }
  const [firstName = '', ...rest] = cleaned.split(/\s+/);
  const lastName = rest.join(' ');
  return { firstName, lastName, fullName: cleaned };
}

/**
 * Formats an error into a readable string with stack.
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ''}`;
  }
  return String(error);
}
