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
 * Masks email local-part while preserving enough context for support/debug.
 * Example: `username@example.com` -> `us****me@example.com`.
 */
export function maskEmail(email: string): string {
  if (typeof email !== 'string') {
    return '';
  }

  const normalized = email.trim();
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex >= normalized.length - 1) {
    return normalized;
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  const keepStart = localPart.length <= 2 ? 1 : 2;
  const keepEnd = localPart.length >= 6 ? 2 : localPart.length >= 4 ? 1 : 0;
  const hiddenLength = Math.max(1, localPart.length - keepStart - keepEnd);

  return `${localPart.slice(0, keepStart)}${'*'.repeat(hiddenLength)}${keepEnd > 0 ? localPart.slice(-keepEnd) : ''}@${domain}`;
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
 * Resolves display name: use explicit name if provided, otherwise generate from email.
 * Returns null when neither value can produce a valid name.
 */
export function resolveNameWithFallback(rawName: unknown, rawEmail: unknown): string | null {
  if (typeof rawName === 'string' && rawName.trim().length > 0) {
    return rawName;
  }

  if (typeof rawEmail !== 'string') {
    return null;
  }

  const normalizedEmail = parseEmail(rawEmail) ?? rawEmail.trim();
  if (!normalizedEmail) {
    return null;
  }

  const generatedName = generateNameFromEmail(normalizedEmail).trim();
  return generatedName || null;
}

/**
 * Generates a human-readable name from the local-part of email.
 * - strips plus-addressing suffix (`+tag`)
 * - treats `.`, `_`, `-` as word separators
 * - collapses spaces and applies Title Case
 * Falls back to the original email string when local-part is empty/invalid.
 */
export function generateNameFromEmail(email: string): string {
  if (typeof email !== 'string') {
    return '';
  }

  const atIndex = email.indexOf('@');
  const hasAt = atIndex !== -1;
  const localPart = hasAt ? email.slice(0, atIndex).trim() : email.trim();

  if (!localPart) {
    return email;
  }

  const plusIndex = localPart.indexOf('+');
  const withoutTag = plusIndex !== -1 ? localPart.slice(0, plusIndex) : localPart;
  const normalized = withoutTag.replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return email;
  }

  const titled = normalized.split(' ').filter(Boolean).map(capitalizeWord).join(' ');

  return titled || email;
}

function capitalizeWord(word: string): string {
  if (!word) return '';
  const first = word.charAt(0);
  const rest = word.slice(1);
  return first.toUpperCase() + rest.toLowerCase();
}
