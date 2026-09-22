import type { Request } from 'express';

/** Express exposes a repeated header as string[]; every caller here wants just the first value. */
export function firstHeaderValue(request: Request, name: string): string | undefined {
  const header = request.headers?.[name];
  return Array.isArray(header) ? header[0] : header;
}
