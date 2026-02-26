import { QueryFailedError } from 'typeorm';

const UNIQUE_CONSTRAINT_CODES = new Set(['23505', 'ER_DUP_ENTRY', 'ER_DUP_KEY', '1062']);

export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = (
    error as QueryFailedError & {
      driverError?: {
        code?: string | number;
        errno?: string | number;
        message?: string;
        detail?: string;
        sqlMessage?: string;
      };
    }
  ).driverError;

  const code = String(driverError?.code ?? driverError?.errno ?? '').toUpperCase();
  if (UNIQUE_CONSTRAINT_CODES.has(code)) {
    return true;
  }

  const rawMessage = [
    error.message,
    driverError?.message,
    driverError?.detail,
    driverError?.sqlMessage,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();

  return (
    rawMessage.includes('duplicate') ||
    rawMessage.includes('unique constraint') ||
    rawMessage.includes('violates unique')
  );
}
