import type { ValueTransformer } from 'typeorm';

/** Stored as JSON text: TypeORM parses a MySQL `json` value again, so the string "12345" came back as 12345. */
export const JSON_TEXT: ValueTransformer = {
  to: (value: unknown) => (value === undefined || value === null ? value : JSON.stringify(value)),
  // SQLite's `json` column has numeric affinity, so a number comes back as a number.
  from: (text: string | number | null | undefined) =>
    text === null || text === undefined ? null : JSON.parse(String(text)),
};
